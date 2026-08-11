export const YouTubeEmbed = ({
  src,
  title = "YouTube video player",
  showDuration = false,
  chapters = "",
}) => {
  const iframeRef = useRef(null);
  const [duration, setDuration] = useState(null);

  // Chapters are pasted verbatim from the video description, one chapter per
  // line. Tolerates the formats descriptions use in the wild: "0:00 Title",
  // "* 00:00 - Title", "- 1:02:03: Title". Lines without a timestamp are ignored.
  const parsedChapters = useMemo(() => {
    if (!chapters) return [];
    return chapters
      .split("\n")
      .map((line) => {
        const match = line.match(
          /^\s*[-*•]?\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*[-–—:]?\s*(\S.*)$/
        );
        if (!match) return null;
        const [, h, m, s, chapterTitle] = match;
        return {
          seconds: (h ? parseInt(h, 10) * 3600 : 0) + parseInt(m, 10) * 60 + parseInt(s, 10),
          label: h ? `${h}:${m.padStart(2, "0")}:${s}` : `${m}:${s}`,
          title: chapterTitle.trim(),
        };
      })
      .filter(Boolean);
  }, [chapters]);

  const jsApiEnabled = showDuration || parsedChapters.length > 0;

  useEffect(() => {
    if (!showDuration) return;
    const onMessage = (event) => {
      if (event.origin !== "https://www.youtube.com") return;
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      const seconds = data?.info?.duration;
      if (typeof seconds === "number" && seconds > 0) setDuration(seconds);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [showDuration]);

  const postToPlayer = (payload) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify(payload),
      "https://www.youtube.com"
    );
  };

  const handleLoad = () => {
    postToPlayer({ event: "listening", id: "ytembed", channel: "widget" });
  };

  const seekTo = (seconds) => {
    postToPlayer({ event: "command", func: "seekTo", args: [seconds, true] });
    postToPlayer({ event: "command", func: "playVideo", args: [] });
  };

  const embedSrc = jsApiEnabled ? `${src}${src.includes("?") ? "&" : "?"}enablejsapi=1` : src;

  const formatDuration = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  };

  return (
    <div>
      <iframe
        ref={iframeRef}
        className="w-full aspect-video rounded-xl"
        src={embedSrc}
        title={title}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
        onLoad={showDuration ? handleLoad : undefined}
      ></iframe>
      {(showDuration || parsedChapters.length > 0) && (
        <div className="mt-2 flex items-start justify-between gap-4 text-sm text-gray-500 dark:text-zinc-500">
          {showDuration && duration !== null && <p>Duration: {formatDuration(duration)}</p>}
          {parsedChapters.length > 0 && (
            <details className="ml-auto text-right">
              <summary className="cursor-pointer select-none">Chapters</summary>
              <ul className="mt-2 space-y-1 text-left">
                {parsedChapters.map((chapter) => (
                  <li key={chapter.seconds}>
                    <button
                      type="button"
                      className="cursor-pointer hover:text-gray-700 dark:hover:text-zinc-300"
                      onClick={() => seekTo(chapter.seconds)}
                    >
                      <span className="font-medium text-primary dark:text-primary-light">
                        {chapter.label}
                      </span>{" "}
                      {chapter.title}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
};
