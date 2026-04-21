import { useState, useCallback } from 'react';
import { convert4kToAdofai, type ConversionOptions, type ConversionResult, type AdofaiChart } from './lib/converter';
import { convertAudioToAdofai } from './lib/audioToAdofai';
import { detectBeatsFromAudio, getDetectionOptions } from './lib/audio/beatDetector';
import type { NoteGenerationStrategy } from './lib/audio/noteGenerator';
import FileUploader from './components/FileUploader';
import ConverterForm from './components/ConverterForm';
import ResultDisplay from './components/ResultDisplay';
import AudioUploader from './components/AudioUploader';
import './styles/main.css';

type TabType = '4k' | 'audio';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('4k');

  // 4K conversion state
  const [inputFile, setInputFile] = useState<string>('');
  const [modelFile, setModelFile] = useState<string>('');
  const [outputPath, setOutputPath] = useState<string>('');
  const [options, setOptions] = useState<ConversionOptions>({
    encodingMode: 'smart',
    chordMode: 'merge',
    includeReleases: false,
    splitSpacingMs: 12.0,
    manualOffsetMs: 0.0,
    useTwirl: true,
    simulateChordsWithAngle: true,
    preserveExplicitBpm: true
  });
  const [conversionResult, setConversionResult] = useState<ConversionResult | null>(null);
  const [generatedChart, setGeneratedChart] = useState<object | null>(null); // Store the generated ADOFAI chart for re-download
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Audio conversion state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioOutputName, setAudioOutputName] = useState<string>('');
  const [noteStrategy, setNoteStrategy] = useState<NoteGenerationStrategy>('single');
  const [audioBaseBpm, setAudioBaseBpm] = useState<number>(0);
  const [detectDetailLevel, setDetectDetailLevel] = useState<number>(5); // 1-10, higher = more aggressive
  const [audioResult, setAudioResult] = useState<ConversionResult | null>(null);

  const handleConvert = useCallback(async () => {
    if (!inputFile) {
      setError('请先选择输入文件');
      return;
    }

    if (!outputPath) {
      setError('请选择输出路径');
      return;
    }

    setLoading(true);
    setError(null);
    setConversionResult(null);
    setGeneratedChart(null);

    try {
      const result = await convert4kToAdofai(inputFile, outputPath, {
        ...options,
        modelPath: modelFile || null
      });
      setConversionResult(result);
      setGeneratedChart(result.chart || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '转换失败');
    } finally {
      setLoading(false);
    }
  }, [inputFile, outputPath, modelFile, options]);

  const handleAudioConvert = useCallback(async () => {
    if (!audioFile) {
      setError('请先选择音频文件');
      return;
    }

    const outputName = audioOutputName || `${audioFile.name.replace(/\.[^/.]+$/, '')}.adofai`;

    setLoading(true);
    setError(null);
    setAudioResult(null);
    setGeneratedChart(null);

    try {
      const beatOptions = getDetectionOptions(detectDetailLevel);
      const energyThresholdPct = Math.max(0, 100 - detectDetailLevel * 10);

      // Detect beats (with energy)
      const { beatInfos, bpm: detectedBpm, confidence } = await detectBeatsFromAudio(audioFile, beatOptions);
      if (beatInfos.length === 0) {
        setError('No beats detected in audio. Please try a different file or set manual Base BPM.');
        setLoading(false);
        return;
      }
      // Optionally warn about low confidence if using auto BPM
      if (confidence < 0.2 && audioBaseBpm <= 0) {
        console.warn(`Low confidence (${(confidence * 100).toFixed(1)}%), but proceeding with detected BPM ${detectedBpm}`);
      }

      const result = await convertAudioToAdofai(
        audioFile,
        outputName,
        {
          encodingMode: options.encodingMode as 'smart' | 'hybrid_angle' | 'speed_only',
          chordMode: options.chordMode as 'merge',
          includeReleases: options.includeReleases,
          splitSpacingMs: options.splitSpacingMs,
          manualOffsetMs: options.manualOffsetMs,
          useTwirl: options.useTwirl,
          simulateChordsWithAngle: options.simulateChordsWithAngle,
          preserveExplicitBpm: options.preserveExplicitBpm,
          energyThresholdPct
        },
        noteStrategy,
        audioBaseBpm > 0 ? audioBaseBpm : undefined,
        beatOptions
      );
      setAudioResult(result);
      setGeneratedChart(result.chart || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '音频转换失败');
    } finally {
      setLoading(false);
    }
  }, [audioFile, audioOutputName, noteStrategy, options, detectDetailLevel]);

  const handleReset = () => {
    setInputFile('');
    setOutputPath('');
    setModelFile('');
    setConversionResult(null);
    setAudioResult(null);
    setError(null);
    setGeneratedChart(null);
    setDetectDetailLevel(5); // reset to default
  };

  return (
    <div className="container">
      <h1>4K to ADOFAI Converter</h1>

      <div className="tabs">
        <button
          className={`tab ${activeTab === '4k' ? 'active' : ''}`}
          onClick={() => setActiveTab('4k')}
        >
          4K Chart Converter
        </button>
        <button
          className={`tab ${activeTab === 'audio' ? 'active' : ''}`}
          onClick={() => setActiveTab('audio')}
        >
          Audio to ADOFAI (NEW)
        </button>
      </div>

      {activeTab === '4k' && (
        <div>
          <div className="card">
            <h2>File Selection</h2>
            <FileUploader
              inputFile={inputFile}
              onInputFileChange={setInputFile}
              outputPath={outputPath}
              onOutputPathChange={setOutputPath}
              onReset={handleReset}
              modelFile={modelFile}
              onModelFileChange={setModelFile}
            />
          </div>

          <div className="card">
            <h2>Conversion Options</h2>
            <ConverterForm
              options={options}
              onOptionsChange={setOptions}
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="card">
            <button
              onClick={handleConvert}
              disabled={loading || !inputFile || !outputPath}
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              {loading ? 'Converting...' : 'Start Conversion'}
            </button>
          </div>

          {conversionResult && (
            <ResultDisplay result={conversionResult} chartData={generatedChart} />
          )}
        </div>
      )}

      {activeTab === 'audio' && (
        <div>
          <div className="card">
            <h2>Audio Upload</h2>
            <AudioUploader
              audioFile={audioFile}
              onAudioFileChange={setAudioFile}
            />
          </div>

          <div className="card">
            <h2>Audio Conversion Options</h2>
            <ConverterForm
              options={options}
              onOptionsChange={setOptions}
            />

            <div className="form-group">
              <label>Output Filename</label>
              <input
                type="text"
                value={audioOutputName}
                onChange={(e) => setAudioOutputName(e.target.value)}
                placeholder={`${audioFile?.name?.replace(/\.[^/.]+$/, '') || 'output'}.adofai`}
              />
            </div>

            <div className="form-group">
              <label htmlFor="noteStrategy">Note Generation Strategy</label>
              <select
                id="noteStrategy"
                className="form-control"
                value={noteStrategy}
                onChange={(e) => setNoteStrategy(e.target.value as NoteGenerationStrategy)}
              >
                <option value="single">Single Track (all beats to column 0)</option>
                <option value="alternating">Alternating (0, 1, 0, 1 repeat)</option>
                <option value="random">Random (random column for each beat)</option>
                <option value="pattern4">4-Pattern (0,1,2,3 cycle)</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="audioBaseBpm">Base BPM (optional, leave at 0 to auto-detect)</label>
              <input
                id="audioBaseBpm"
                type="number"
                min="0"
                step="0.01"
                value={audioBaseBpm}
                onChange={(e) => setAudioBaseBpm(Number(e.target.value))}
                placeholder="Auto-detects if 0"
              />
            </div>

            <div className="form-group">
              <label htmlFor="detectDetailLevel">
                Detection Detail (暴力值) - Level {detectDetailLevel}/10
              </label>
              <input
                id="detectDetailLevel"
                type="range"
                min="1"
                max="10"
                value={detectDetailLevel}
                onChange={(e) => setDetectDetailLevel(Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <small style={{ color: '#666', display: 'block', marginTop: '0.25rem' }}>
                {detectDetailLevel <= 3 && '🟢 Low: faster, fewer false positives'}
                {detectDetailLevel >= 4 && detectDetailLevel <= 7 && '🟡 Medium: balanced'}
                {detectDetailLevel >= 8 && '🔴 High: extremely aggressive - catches everything!'}
              </small>
            </div>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="card">
            <button
              onClick={handleAudioConvert}
              disabled={loading || !audioFile}
              style={{ width: '100%', marginBottom: '1rem' }}
            >
              {loading ? 'Processing...' : 'Convert Audio to ADOFAI'}
            </button>
          </div>

          {audioResult && (
            <ResultDisplay result={audioResult} chartData={generatedChart} />
          )}
        </div>
      )}
    </div>
  );
}

export default App;
