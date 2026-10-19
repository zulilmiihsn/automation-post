import { useEffect, useRef, useState } from 'react';
import ConsoleModal from './ConsoleModal';

const MODES = ['marketplace', 'viral', 'comment', 'sundul', 'chat', 'agent', 'scraper'];

export default function GlobalConsole() {
  const [show, setShow] = useState(false);
  const [logs, setLogs] = useState([]);
  const [running, setRunning] = useState({});
  const termRef = useRef(null);

  useEffect(() => {
    const open = () => setShow(true);
    window.addEventListener('autopost:open-console', open);
    return () => window.removeEventListener('autopost:open-console', open);
  }, []);

  useEffect(() => {
    const stream = new EventSource('/api/stream-logs');
    stream.onmessage = (event) => {
      try {
        const item = JSON.parse(event.data);
        if (item.msg || item.message) {
          setLogs(prev => [...prev.slice(-300), {
            ...item,
            time: item.time || new Date().toLocaleTimeString(),
          }]);
        }
        if (item.type === 'status' && item.mode) {
          setRunning(prev => ({ ...prev, [item.mode]: Boolean(item.isRunning) }));
        }
        if (item.done) {
          if (item.mode) setRunning(prev => ({ ...prev, [item.mode]: false }));
          else setRunning(Object.fromEntries(MODES.map(mode => [mode, false])));
        }
      } catch { /* Ignore malformed stream events. */ }
    };
    return () => stream.close();
  }, []);

  return (
    <ConsoleModal
      show={show}
      onClose={() => setShow(false)}
      logs={logs}
      onClearLogs={() => setLogs([])}
      isRunningMp={running.marketplace}
      isRunningViral={running.viral}
      isRunningComment={running.comment}
      isRunningSundul={running.sundul}
      isRunningChat={running.chat}
      isRunningAgent={running.agent}
      isRunningScraper={running.scraper}
      termRef={termRef}
    />
  );
}
