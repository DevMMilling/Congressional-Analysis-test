const numberFormatter = new Intl.NumberFormat("en-US");

export default function PaginationBar({ page, pageSize, totalCount, pageCount, hasNext, loading = false, onPageChange }) {
  const currentPage = Number.isFinite(page) && page > 0 ? page : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 0;
  const safeTotalCount = Number.isFinite(totalCount) && totalCount >= 0 ? totalCount : 0;
  const start = safeTotalCount === 0 ? 0 : (currentPage - 1) * safePageSize + 1;
  const end = safeTotalCount === 0 ? 0 : Math.min(currentPage * safePageSize, safeTotalCount);
  const knownPageCount = Number.isFinite(pageCount) && pageCount > 0 ? pageCount : null;
  const canGoNext = knownPageCount ? currentPage < knownPageCount : Boolean(hasNext);

  return (
    <div
      className="pill-row"
      style={{
        justifyContent: "space-between",
        alignItems: "center",
        margin: "1rem 0 0",
      }}
    >
      <span className="muted">
        {loading
          ? "Loading results..."
          : safeTotalCount
            ? `Showing ${numberFormatter.format(start)}-${numberFormatter.format(end)} of ${numberFormatter.format(safeTotalCount)}`
            : "No results"}
      </span>
      <div className="pill-row" style={{ margin: 0 }}>
        <button type="button" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage <= 1}>
          Previous
        </button>
        <span className="pill">
          Page {currentPage}
          {knownPageCount ? ` of ${knownPageCount}` : ""}
        </span>
        <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={!canGoNext}>
          Next
        </button>
      </div>
    </div>
  );
}
