import { useMemo, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:3458";

function App() {
  const [leaderCode, setLeaderCode] = useState("");
  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const sortedNodes = useMemo(() => {
    return [...nodes].sort((left, right) => {
      if (left.online === right.online) return left.name.localeCompare(right.name);
      return left.online ? -1 : 1;
    });
  }, [nodes]);

  async function loadCandidates() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/network/list`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load network nodes");
      }
      setNodes(Array.isArray(data.nodes) ? data.nodes : []);
      if (!Array.isArray(data.nodes) || data.nodes.length === 0) {
        setMessage("No eligible leaders found right now.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function electLeader(code) {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/network/elect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leaderCode: code }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Election failed");
      }
      setMessage(`Leader elected: ${data.leaderCode}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function loadRelayLogs() {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/network/logs?limit=30`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load relay logs");
      }
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  const canElectManual = leaderCode.trim().length > 0 && !loading;

  return (
    <div className="page">
      <h1>Network Leader Election</h1>

      <div className="panel">
        <div className="row">
          <button disabled={loading} onClick={loadCandidates}>
            {loading ? "Loading..." : "Find Leaders"}
          </button>
        </div>

        <div className="row">
          <input
            value={leaderCode}
            onChange={event => setLeaderCode(event.target.value.toUpperCase())}
            placeholder="Enter leader code"
          />
          <button disabled={!canElectManual} onClick={() => electLeader(leaderCode.trim())}>
            Elect by Code
          </button>
        </div>

        {message ? <p className="message">{message}</p> : null}
      </div>

      <div className="panel">
        <div className="row">
          <button disabled={loading} onClick={loadRelayLogs}>
            {loading ? "Loading..." : "Load Relay Logs"}
          </button>
        </div>

        <h2>Eligible Nodes</h2>
        {sortedNodes.length === 0 ? (
          <p className="muted">Run "Find Leaders" to load candidates.</p>
        ) : (
          <ul>
            {sortedNodes.map(node => (
              <li key={node.id}>
                <div>
                  <strong>{node.name}</strong>
                  <span className={`status ${node.online ? "online" : "offline"}`}>
                    {node.online ? "online" : "offline"}
                  </span>
                </div>
                <div className="code">Code: {node.code}</div>
                <button disabled={loading} onClick={() => electLeader(node.code)}>
                  Elect
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="panel">
        <h2>Relay Request Logs</h2>
        {logs.length === 0 ? (
          <p className="muted">No logs loaded yet.</p>
        ) : (
          <ul>
            {logs.map(log => (
              <li key={log.id} className="log-item">
                <div>
                  <strong>{log.action}</strong>
                  <span className={`status ${log.status === "completed" ? "online" : "offline"}`}>
                    {log.status}
                  </span>
                </div>
                <div className="code">
                  {new Date(log.createdAt).toLocaleString()} | leader: {log.leaderId.slice(0, 8)} |
                  target: {log.targetNodeId.slice(0, 8)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default App;
