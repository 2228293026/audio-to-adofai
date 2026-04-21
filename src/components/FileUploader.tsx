import { useRef, useState, DragEvent, ChangeEvent } from 'react';

interface FileUploaderProps {
  inputFile: string;
  onInputFileChange: (path: string) => void;
  outputPath: string;
  onOutputPathChange: (path: string) => void;
  onReset: () => void;
  modelFile: string;
  onModelFileChange: (path: string) => void;
}

export default function FileUploader({
  inputFile,
  onInputFileChange,
  outputPath,
  onOutputPathChange,
  onReset,
  modelFile,
  onModelFileChange
}: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (callback: (path: string) => void) => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // For browser, we'll use object URLs - in real app you'd upload to server
      const path = URL.createObjectURL(file);
      callback(path);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      const path = URL.createObjectURL(file);
      onInputFileChange(path);
    }
  };

  const getOutputFileName = () => {
    if (outputPath) return outputPath;
    if (inputFile) {
      const parts = inputFile.split('/');
      const name = parts[parts.length - 1];
      return `${name.replace(/\.[^/.]+$/, '')}_converted.adofai`;
    }
    return '';
  };

  return (
    <div>
      <div className="form-row">
        <div className="form-group">
          <label>Input 4K Chart (.json/.txt)</label>
          <div
            className={`upload-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
          >
            {inputFile ? (
              <div>
                <div>File selected</div>
                <small>{inputFile.split('/').pop()}</small>
              </div>
            ) : (
              <div>Click or drag file here</div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".json,.txt"
            onChange={handleFileSelect(onInputFileChange)}
            style={{ display: 'none' }}
          />
        </div>

        <div className="form-group">
          <label>Style Model (optional)</label>
          <input
            type="file"
            accept=".json"
            onChange={handleFileSelect(onModelFileChange)}
          />
          {modelFile && (
            <small style={{ color: 'green' }}>
              Model loaded: {modelFile.split('/').pop()}
            </small>
          )}
        </div>
      </div>

      <div className="form-row" style={{ marginTop: '1rem' }}>
        <div className="form-group">
          <label>Output .adofai File</label>
          <input
            type="text"
            value={getOutputFileName()}
            onChange={(e) => onOutputPathChange(e.target.value)}
            placeholder="output.adofai"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.5rem' }}>
          <button onClick={() => onReset()}>Reset</button>
        </div>
      </div>

      {inputFile && (
        <div style={{ marginTop: '1rem', padding: '0.5rem', background: '#f0f0f0', borderRadius: '4px' }}>
          <small>Input: {inputFile}</small>
        </div>
      )}
    </div>
  );
}
