import { useState, useCallback } from 'react';
import { ConversionResult } from '../lib/converter';

interface ResultDisplayProps {
  result: ConversionResult;
  chartData?: object | null; // Optional chart data for re-download
}

export default function ResultDisplay({ result, chartData }: ResultDisplayProps) {
  const [showDetails, setShowDetails] = useState(false);

  const downloadChart = useCallback(() => {
    if (chartData) {
      // Re-download from stored chart data
      const data = JSON.stringify(chartData, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.outputPath?.split('/').pop() || 'chart.adofai';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // Fallback: file was auto-downloaded
      alert('如果文件未自动下载，请检查浏览器下载设置或尝试重新转换。');
    }
  }, [chartData, result.outputPath]);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>Conversion Successful!</h3>
        <button onClick={downloadChart}>Download ADOFAI File</button>
      </div>

      <div className="results">
        <strong>Summary:</strong>
        <div>Encoding Mode: {result.encoding.encodingMode}</div>
        <div>Chord Mode: {result.chordMode}</div>
        <div>Profile: {result.profile}</div>
        <div>Timeline: {result.timeline.timelineHitCount} hits from {result.timeline.groupCount} groups</div>
        <div>Chords: {result.timeline.chordGroups} chord groups (max size: {result.timeline.maxGroupSize})</div>
        <div>Actions: {result.encoding.actionsCount} total ({result.encoding.setspeedCount} SetSpeed, {result.encoding.twirlCount} Twirl, {result.encoding.pauseCount} Pause)</div>
        <div>Path length: {result.encoding.pathLength} segments</div>
        <div>Time range: {result.encoding.firstHitSeconds.toFixed(3)}s - {result.encoding.lastHitSeconds.toFixed(3)}s</div>

        {showDetails && (
          <>
            <hr style={{ margin: '1rem 0' }} />
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </>
        )}
      </div>

      <button
        onClick={() => setShowDetails(!showDetails)}
        style={{ marginTop: '1rem' }}
      >
        {showDetails ? 'Hide Details' : 'Show Full Details'}
      </button>
    </div>
  );
}
