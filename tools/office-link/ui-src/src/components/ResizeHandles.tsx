import { callApi } from "../bridge/linkApi";

type Edge =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

const EDGES: { edge: Edge; className: string; cursor: string }[] = [
  { edge: "n", className: "left-2 right-2 top-0 h-1.5", cursor: "ns-resize" },
  { edge: "s", className: "left-2 right-2 bottom-0 h-1.5", cursor: "ns-resize" },
  { edge: "e", className: "top-2 bottom-2 right-0 w-1.5", cursor: "ew-resize" },
  { edge: "w", className: "top-2 bottom-2 left-0 w-1.5", cursor: "ew-resize" },
  { edge: "nw", className: "left-0 top-0 h-3 w-3", cursor: "nwse-resize" },
  { edge: "ne", className: "right-0 top-0 h-3 w-3", cursor: "nesw-resize" },
  { edge: "sw", className: "left-0 bottom-0 h-3 w-3", cursor: "nesw-resize" },
  { edge: "se", className: "right-0 bottom-0 h-3 w-3", cursor: "nwse-resize" },
];

function startResize(edge: Edge) {
  void callApi("window_start_resize", edge);
}

export function ResizeHandles() {
  return (
    <>
      {EDGES.map(({ edge, className, cursor }) => (
        <div
          key={edge}
          role="presentation"
          aria-hidden="true"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            startResize(edge);
          }}
          className={`win-resize-handle pointer-events-auto absolute z-[60] ${className}`}
          style={{ cursor }}
        />
      ))}
      {/* Visible size grip hint (bottom-right) */}
      <div
        aria-hidden="true"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          startResize("se");
        }}
        className="win-resize-handle pointer-events-auto absolute bottom-0.5 right-0.5 z-[61] flex h-4 w-4 cursor-nwse-resize items-end justify-end p-0.5 text-[#8A8886]"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M9 1v8H1" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M9 5v4H5M9 8v1H8" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </div>
    </>
  );
}
