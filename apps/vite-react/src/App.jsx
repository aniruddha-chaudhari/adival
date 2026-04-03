import { useMemo, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:3458";

function App() {
  const [leaderCode, setLeaderCode] = useState("");
  const [nodeName, setNodeName] = useState("");
  const [nodes, setNodes] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const onlineCandidates = useMemo(() => {
    return nodes
      .filter(node => node.online)
      .sort((left, right) => left.name.localeCompare(right.name));
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
      const availableNodes = Array.isArray(data.nodes) ? data.nodes : [];
      setNodes(availableNodes);
      if (availableNodes.filter(node => node.online).length === 0) {
        setMessage("No online leaders available right now.");
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

  async function updateNodeName() {
    const trimmed = nodeName.trim();
    if (!trimmed) {
      setMessage("Name is required.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`${API_BASE}/network/reregister-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to update node name");
      }
      setNodeName(data.name || trimmed);
      setMessage(`Node name updated: ${data.name || trimmed}`);
      await loadCandidates();
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
      <header className="hero">
        <p className="eyebrow">NETWORK CONTROL</p>
        <h1>Leader Election</h1>
        <p className="hero-meta">{onlineCandidates.length} online candidates</p>
      </header>

      <div className="panel">
        <div className="row">
          <input
            value={nodeName}
            onChange={event => setNodeName(event.target.value)}
            placeholder="Set your node name"
          />
          <button disabled={loading || !nodeName.trim()} onClick={updateNodeName}>
            Save Name
          </button>
        </div>

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

        <div className="panel-head">
          <h2>Eligible Nodes</h2>
          <span className="meta-count">ONLINE ONLY</span>
        </div>

        {onlineCandidates.length === 0 ? (
          <p className="muted">No online leaders to elect. Run "Find Leaders" to refresh.</p>
        ) : (
          <ul>
            {onlineCandidates.map(node => (
              <li key={node.id}>
                <div>
                  <div className="node-title">
                    <strong className="node-name">{node.name}</strong>
                    <span className="status online">ONLINE</span>
                  </div>
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
        <div className="panel-head">
          <h2>Relay Request Logs</h2>
          <span className="meta-count">LAST 30</span>
        </div>
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
