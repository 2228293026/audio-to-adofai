import { ConversionOptions } from '../lib/converter';

interface ConverterFormProps {
  options: ConversionOptions;
  onOptionsChange: (options: ConversionOptions) => void;
}

export default function ConverterForm({
  options,
  onOptionsChange
}: ConverterFormProps) {
  const updateOption = <K extends keyof ConversionOptions>(
    key: K,
    value: ConversionOptions[K]
  ) => {
    onOptionsChange({ ...options, [key]: value });
  };

  return (
    <div>
      <div className="form-row">
        <div className="form-group">
          <label>Encoding Mode</label>
          <select
            value={options.encodingMode}
            onChange={(e) => updateOption('encodingMode', e.target.value as ConversionOptions['encodingMode'])}
          >
            <option value="smart">Smart (智能排砖)</option>
            <option value="hybrid_angle">Hybrid Angle (混合角度)</option>
            <option value="speed_only">Speed Only (强行直线)</option>
            <option value="force_straight">Force Straight (同 speed_only)</option>
          </select>
          <small style={{ color: '#666', marginTop: '0.25rem', display: 'block' }}>
            {options.encodingMode === 'smart' && 'Dynamic: straight for dense, angles for sparse'}
            {options.encodingMode === 'hybrid_angle' && 'Prioritizes angle data with speed/twirl events'}
            {options.encodingMode === 'speed_only' && 'Straight path with BPM events only'}
          </small>
        </div>

        <div className="form-group">
          <label>Chord Mode</label>
          <select
            value={options.chordMode}
            onChange={(e) => updateOption('chordMode', e.target.value as ConversionOptions['chordMode'])}
          >
            <option value="merge">Merge (合并)</option>
            <option value="split">Split (拆分)</option>
            <option value="force_single">Force Single (强制单押)</option>
          </select>
          <small style={{ color: '#666', marginTop: '0.25rem', display: 'block' }}>
            {options.chordMode === 'merge' && 'Combine simultaneous notes into one tile'}
            {options.chordMode === 'split' && 'Expand chords into sequential tiles'}
            {options.chordMode === 'force_single' && 'Ignore all but first note in each chord'}
          </small>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Split Spacing (ms)</label>
          <input
            type="number"
            value={options.splitSpacingMs}
            onChange={(e) => updateOption('splitSpacingMs', Number(e.target.value))}
            min={0}
            step={1}
          />
          <small>Time between split chord pieces</small>
        </div>

        <div className="form-group">
          <label>Manual Offset (ms)</label>
          <input
            type="number"
            value={options.manualOffsetMs}
            onChange={(e) => updateOption('manualOffsetMs', Number(e.target.value))}
          />
          <small>Global timing offset adjustment</small>
        </div>
      </div>

      <div className="form-row">
        <div className="checkbox-group">
          <input
            type="checkbox"
            id="includeReleases"
            checked={options.includeReleases}
            onChange={(e) => updateOption('includeReleases', e.target.checked)}
          />
          <label htmlFor="includeReleases">Include releases as hits (把长条尾判也转成点击)</label>
        </div>

        <div className="checkbox-group">
          <input
            type="checkbox"
            id="useTwirl"
            checked={options.useTwirl}
            onChange={(e) => updateOption('useTwirl', e.target.checked)}
          />
          <label htmlFor="useTwirl">Enable Twirl (启用 Twirl)</label>
        </div>
      </div>

      <div className="form-row">
        <div className="checkbox-group">
          <input
            type="checkbox"
            id="simulateChords"
            checked={options.simulateChordsWithAngle}
            onChange={(e) => updateOption('simulateChordsWithAngle', e.target.checked)}
          />
          <label htmlFor="simulateChords">Simulate chord angles (仿双押/多押角度)</label>
        </div>

        <div className="checkbox-group">
          <input
            type="checkbox"
            id="preserveBpm"
            checked={options.preserveExplicitBpm}
            onChange={(e) => updateOption('preserveExplicitBpm', e.target.checked)}
          />
          <label htmlFor="preserveBpm">Preserve BPM changes (尽量保留原谱 BPM 变化)</label>
        </div>
      </div>
    </div>
  );
}
