export const YouTubePlaylistCarousel = ({ list, description = "", videos = null }) => {
  const playlistId = useMemo(() => {
    if (!list) return "";
    const match = list.match(/[?&]list=([^&]+)/);
    return match ? match[1] : list;
  }, [list]);
  const playlistUrl = `https://www.youtube.com/playlist?list=${playlistId}`;
  const cacheKey = `yt-playlist-${playlistId}`;
  const cacheTtlMs = 60 * 60 * 1000;

  // Explicit video IDs pin the slide list; otherwise the playlist player
  // reports them at runtime (cached below).
  const pinnedVideos = useMemo(() => {
    if (Array.isArray(videos)) return videos;
    if (typeof videos === "string" && videos.trim()) return videos.trim().split(/[\s,]+/);
    return null;
  }, [videos]);

  const playerRef = useRef(null);
  const trackRef = useRef(null);
  const [videoIds, setVideoIds] = useState(pinnedVideos || []);
  const [channel, setChannel] = useState(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const readCache = () => {
    try {
      return JSON.parse(localStorage.getItem(cacheKey));
    } catch {
      return null;
    }
  };

  const writeCache = (patch) => {
    try {
      const previous = readCache() || {};
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ ...previous, ...patch, fetchedAt: Date.now() })
      );
    } catch {
      // Storage unavailable (private browsing, quota) — live data still renders.
    }
  };

  // Stale-while-revalidate: render whatever was cached immediately; only hit
  // oEmbed again when the cache is missing or older than an hour. A failed
  // fetch silently leaves the cached render in place.
  useEffect(() => {
    if (!playlistId) return;
    const cached = readCache();
    if (cached?.channel) setChannel(cached.channel);
    if (!pinnedVideos && Array.isArray(cached?.videos) && cached.videos.length > 0) {
      setVideoIds(cached.videos);
    }
    if (cached?.fetchedAt && Date.now() - cached.fetchedAt < cacheTtlMs) return;
    fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(playlistUrl)}&format=json`
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data?.author_name) return;
        const url = (data.author_url || "").startsWith("http")
          ? data.author_url
          : `https://www.youtube.com${data.author_url || ""}`;
        const freshChannel = { name: data.author_name, url };
        setChannel(freshChannel);
        writeCache({ channel: freshChannel });
      })
      .catch(() => {});
  }, [playlistId]);

  // The playlist player broadcasts its video IDs over the enablejsapi
  // postMessage channel once we send the "listening" handshake.
  useEffect(() => {
    if (!playlistId) return;
    const onMessage = (event) => {
      if (event.origin !== "https://www.youtube.com") return;
      if (!playerRef.current || event.source !== playerRef.current.contentWindow) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      const ids = data?.info?.playlist;
      if (Array.isArray(ids) && ids.length > 0 && ids.every((id) => typeof id === "string")) {
        if (!pinnedVideos) setVideoIds(ids);
        writeCache({ videos: ids });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [playlistId, pinnedVideos]);

  const handlePlayerLoad = () => {
    playerRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: "ytplaylist", channel: "widget" }),
      "https://www.youtube.com"
    );
  };

  const updateArrows = () => {
    const track = trackRef.current;
    if (!track) return;
    setAtStart(track.scrollLeft <= 4);
    setAtEnd(track.scrollLeft + track.clientWidth >= track.scrollWidth - 4);
  };

  useEffect(() => {
    updateArrows();
    window.addEventListener("resize", updateArrows);
    return () => window.removeEventListener("resize", updateArrows);
  }, [videoIds]);

  const scrollByPage = (direction) => {
    const track = trackRef.current;
    track?.scrollBy({ left: direction * track.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="yt-carousel">
      {description && <p className="yt-carousel-description">{description}</p>}
      <div className="yt-carousel-viewport">
        <div className="yt-carousel-track" ref={trackRef} onScroll={updateArrows}>
          <div className="yt-carousel-slide">
            <iframe
              ref={playerRef}
              src={`https://www.youtube.com/embed/videoseries?list=${playlistId}&enablejsapi=1`}
              title="YouTube playlist player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              onLoad={handlePlayerLoad}
            ></iframe>
          </div>
          {videoIds.slice(1).map((videoId) => (
            <div className="yt-carousel-slide" key={videoId}>
              <iframe
                src={`https://www.youtube.com/embed/${videoId}`}
                title="YouTube video player"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              ></iframe>
            </div>
          ))}
        </div>
        {!(atStart && atEnd) && (
          <>
            <button
              type="button"
              className="yt-carousel-arrow yt-carousel-arrow-left"
              aria-label="Previous videos"
              disabled={atStart}
              onClick={() => scrollByPage(-1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="yt-carousel-arrow yt-carousel-arrow-right"
              aria-label="Next videos"
              disabled={atEnd}
              onClick={() => scrollByPage(1)}
            >
              ›
            </button>
          </>
        )}
      </div>
      <p className="yt-carousel-footer">
        <a href={playlistUrl} target="_blank" rel="noreferrer">
          View the full playlist
        </a>
        {channel && (
          <>
            {" "}
            · by{" "}
            <a href={channel.url} target="_blank" rel="noreferrer">
              {channel.name}
            </a>{" "}
            on YouTube
          </>
        )}
      </p>
    </div>
  );
};
