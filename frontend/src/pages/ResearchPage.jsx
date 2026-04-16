import { useMemo } from "react";
import ResearchWorkspace from "../components/ResearchWorkspace";

export default function ResearchPage() {
  const initialState = useMemo(() => {
    if (typeof window === "undefined") {
      return { politician: "", ticker: "", signal: "" };
    }

    const params = new URLSearchParams(window.location.search);
    return {
      politician: params.get("politician") || "",
      ticker: params.get("ticker") || "",
      signal: params.get("signal") || "",
    };
  }, []);

  return <ResearchWorkspace initialPoliticianId={initialState.politician} initialTicker={initialState.ticker} initialSignalId={initialState.signal} />;
}
