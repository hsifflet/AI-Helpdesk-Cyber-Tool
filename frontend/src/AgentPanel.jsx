import React, { useState } from "react";

const box = { marginTop: 20, padding: 16, border: "1px solid #d0d7e2", borderRadius: 10 };

export default function AgentPanel({ api, ticketId, onUseAsComment }) {
  const [state, setState] = useState({ busy: false, result: null, error: "" });

  async function ask() {
    setState({ busy: true, result: null, error: "" });
    try {
      const result = await api(`/api/tickets/${ticketId}/agent`, { method: "POST" });
      setState({ busy: false, result, error: "" });
    } catch {
      setState({ busy: false, result: null, error: "The agent could not answer right now." });
    }
  }

  const { busy, result, error } = state;
  return (
    <div style={box}>
      <h3 style={{ marginTop: 0 }}>AI agent</h3>
      <button className="primary-button" onClick={ask} disabled={busy}>{busy ? "Working..." : "Ask the agent"}</button>
      {error && <p>{error}</p>}
      {result && (
        <div style={{ marginTop: 12 }}>
          <small>Provider: {result.provider}</small>
          <ol>{result.steps.map((step, i) => <li key={i}><strong>{step.tool}</strong> - {step.summary}</li>)}</ol>
          <p style={{ whiteSpace: "pre-wrap" }}>{result.answer}</p>
          <button className="primary-button" onClick={() => onUseAsComment(result.answer)}>Use as comment draft</button>
        </div>
      )}
    </div>
  );
}
