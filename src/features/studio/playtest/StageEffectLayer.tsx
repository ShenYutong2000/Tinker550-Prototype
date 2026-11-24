import { useEffect, useRef, useState } from 'react';
import type { AssetItem } from '../asset-library/assetLibraryModel';
import type { EffectOccurrence } from './stageEffects';
import { WORLD_H, WORLD_W } from './stageLayout';

function EffectVisual({ occurrence, asset, readTime }: {
  occurrence: EffectOccurrence; asset: AssetItem; readTime: () => number;
}) {
  const [elapsed, setElapsed] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const state = asset.states.find(item => item.id === asset.activeStateId) ?? asset.states[0];
  const config = occurrence.placement.effect!;
  useEffect(() => {
    let frame = 0;
    let previous = readTime();
    const update = () => {
      const now = readTime();
      const frozen = now === previous;
      previous = now;
      for (const media of [video.current, audio.current]) {
        if (!media) continue;
        if (frozen) media.pause();
        else if (media.paused && !media.ended) void media.play().catch(() => {});
      }
      const age = Math.max(0, now - occurrence.at);
      setElapsed(age);
      if (age < config.durationMs) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [occurrence, config.durationMs, readTime]);
  if (!state || elapsed >= config.durationMs) return null;
  const source = state.candidates.find(candidate => candidate.id === state.selectedCandidateId)?.previewUrl || state.mediaUrl;
  const sound = state.audioCandidates.find(candidate => candidate.id === state.selectedAudioCandidateId)?.audioUrl || state.audioUrl;
  const opacity = config.opacity * (config.fade ? 1 - elapsed / config.durationMs : 1);
  return <div aria-label={asset.name} style={{
    position: 'absolute', left: occurrence.point.x / WORLD_W * 100 + '%',
    top: occurrence.point.y / WORLD_H * 100 + '%', transform: 'translate(-50%, -50%)',
    width: (occurrence.placement.width ?? 64) / WORLD_W * 100 + '%',
    height: (occurrence.placement.height ?? 64) / WORLD_H * 100 + '%', opacity,
  }}>
    {state.mediaKind === 'video'
      ? <video ref={video} src={source} autoPlay muted playsInline className="h-full w-full object-contain" />
      : <img src={source} alt="" className="h-full w-full object-contain" />}
    {config.sound && sound && <audio ref={audio} src={sound} autoPlay />}
  </div>;
}

export function StageEffectLayer({ occurrences, assets, readRunTime, readPreviewTime }: {
  occurrences: EffectOccurrence[]; assets: AssetItem[];
  readRunTime: () => number; readPreviewTime: () => number;
}) {
  return <div className="pointer-events-none absolute inset-0 z-40" aria-label="Stage effects">
    {occurrences.map(occurrence => {
      const asset = assets.find(item => item.id === occurrence.placement.assetId);
      return asset && <EffectVisual key={occurrence.key} occurrence={occurrence} asset={asset}
        readTime={occurrence.preview ? readPreviewTime : readRunTime} />;
    })}
  </div>;
}

export function TimelineEffectFrame({ asset, placement, point, age }: {
  asset: AssetItem;
  placement: import('./stageLayout').StagePlacement;
  point: EffectOccurrence['point'];
  age: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const state = asset.states.find(item => item.id === asset.activeStateId) ?? asset.states[0];
  const source = state?.candidates.find(candidate => candidate.id === state.selectedCandidateId)?.previewUrl || state?.mediaUrl;
  const config = placement.effect;
  const seek = () => {
    const media = video.current;
    if (media && Number.isFinite(media.duration)) {
      const seconds = Math.min(media.duration, age / 1000);
      if (Math.abs(media.currentTime - seconds) > 0.05) media.currentTime = seconds;
    }
  };
  useEffect(seek, [age, source]);
  if (!source || !config) return null;
  return <div aria-label={asset.name} style={{
    position: 'absolute', left: point.x / WORLD_W * 100 + '%', top: point.y / WORLD_H * 100 + '%',
    transform: 'translate(-50%, -50%)', width: (placement.width ?? 64) / WORLD_W * 100 + '%',
    height: (placement.height ?? 64) / WORLD_H * 100 + '%',
    opacity: config.opacity * (config.fade ? 1 - age / config.durationMs : 1),
  }}>
    {state?.mediaKind === 'video' ? <video ref={video} src={source} muted playsInline preload="auto"
      onLoadedMetadata={seek} className="h-full w-full object-contain" />
      : <img src={source} alt="" className="h-full w-full object-contain" />}
  </div>;
}
