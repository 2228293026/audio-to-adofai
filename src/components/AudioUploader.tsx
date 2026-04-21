import { useRef, useState, DragEvent, ChangeEvent } from 'react';

interface AudioUploaderProps {
  audioFile: File | null;
  onAudioFileChange: (file: File | null) => void;
}

export default function AudioUploader({
  audioFile,
  onAudioFileChange
}: AudioUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      onAudioFileChange(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
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
      onAudioFileChange(file);
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
    }
  };

  const clearFile = () => {
    onAudioFileChange(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
  };

  return (
    <div>
      <div
        className={`upload-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !audioFile && inputRef.current?.click()}
        style={{ cursor: audioFile ? 'default' : 'pointer' }}
      >
        {audioFile ? (
          <div>
            <div style={{ fontWeight: 'bold' }}>{audioFile.name}</div>
            <small>
              {(audioFile.size / 1024 / 1024).toFixed(2)} MB
            </small>
            {audioUrl && (
              <div style={{ marginTop: '1rem' }}>
                <audio controls src={audioUrl} style={{ width: '100%' }}>
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              style={{ marginTop: '1rem' }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div>Click or drag audio file here (MP3, WAV, etc.)</div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.m4a"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
    </div>
  );
}
