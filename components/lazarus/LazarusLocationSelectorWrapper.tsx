"use client";

import { useCallback, useRef, useState } from "react";
import type { PatientBodyRegion, PatientBodySubregion } from "@/lib/patient-flow";
import {
  mapLazarusToCanonical,
  type LazarusBodyPart,
} from "@/lib/lazarus-mapping";

export interface LazarusLocationSelectorWrapperProps {
  activeRegion: PatientBodyRegion | null;
  activeSubregion: PatientBodySubregion | null;
  onSelectionChange: (
    region: PatientBodyRegion | null,
    subregion: PatientBodySubregion | null,
    rawLazarusPart: string,
  ) => void;
  onClose: () => void;
  labels: {
    pinpointTitle: string;
    zoomInstruction: string;
    zoomIn: string;
    zoomOut: string;
    flipToBack: string;
    flipToFront: string;
    cancel: string;
    confirm: string;
    neutral: string;
    male: string;
    female: string;
    selectedLocation: string;
    noAreaSelected: string;
  };
}

export type LazarusFigureGender = "neutral" | "male" | "female";

/**
 * Executes the exact Lazarus coordinate-to-bodypart determination algorithm
 * from lazarus-location-selector v1.5.2 (View1.js).
 */
export function determineLazarusBodyPart(
  percentX: number,
  percentY: number,
  cropWidth: number,
  cropHeight: number,
  front: boolean,
  gender: LazarusFigureGender | boolean = "neutral",
): LazarusBodyPart {
  const centerX = percentX + cropWidth / 2;
  const centerY = percentY + cropHeight / 2;

  const chinYLine = 27;
  const torsoTopLine = 30;
  const abdomenTopLine = 40;
  const legTopLine = 50;
  const footTopLine = 85;
  const handTopLine = 52;
  const handBottomLine = 60;
  const armTopLine = 30;

  const midLine = 50;
  const headXLine = 5;
  const outsideLegXLine = 15;
  const insideHandXLine = 20;
  const outsideFootXLine = 20;
  const isFemale = gender === "female" || gender === true;
  const shoulderXLine = isFemale ? 7 : 10;

  // Gaps between body parts
  if (centerX < midLine + 6 && centerX > midLine - 6 && centerY < 100 && centerY > 80) return "";
  if (centerX < midLine + 4 && centerX > midLine - 4 && centerY <= 80 && centerY > 70) return "";
  if ((centerX < midLine - headXLine || centerX > midLine + headXLine) && centerY > 0 && centerY < 27) return "";
  if ((centerX < midLine - 20 || centerX > midLine + 20) && centerY > 27 && centerY < 40) return "";

  if (centerX < midLine + headXLine && centerX > midLine - headXLine && centerY > chinYLine && centerY < torsoTopLine) {
    return "neck";
  }

  if (centerX < midLine + headXLine && centerX > midLine - headXLine && centerY > 0 && centerY < chinYLine) {
    return front ? "face" : "head";
  } else if (
    centerX < midLine + shoulderXLine &&
    centerX > midLine - shoulderXLine &&
    centerY > torsoTopLine &&
    centerY < abdomenTopLine
  ) {
    return front ? "torso" : "back";
  } else if (
    centerX < midLine + shoulderXLine &&
    centerX > midLine - shoulderXLine &&
    centerY > abdomenTopLine &&
    centerY < legTopLine
  ) {
    return front ? "abdomen" : "lower back";
  }

  if (centerY > footTopLine) {
    if (centerX < midLine && centerX > outsideFootXLine) {
      return front ? "right foot" : "left foot";
    } else if (centerX > midLine && centerX < 100 - outsideFootXLine) {
      return front ? "left foot" : "right foot";
    }
  } else if (centerY > legTopLine) {
    if (centerX < midLine && centerX > 50 - outsideLegXLine) {
      return front ? "right leg" : "left leg";
    } else if (centerX > midLine && centerX < 50 + outsideLegXLine) {
      return front ? "left leg" : "right leg";
    }
  }

  if (centerY > handTopLine && centerY < handBottomLine) {
    if (centerX < midLine - insideHandXLine) {
      return front ? "right hand" : "left hand";
    } else if (centerX > midLine + insideHandXLine) {
      return front ? "left hand" : "right hand";
    }
  }

  if (centerY > armTopLine && centerY < handTopLine) {
    if (centerX < midLine - shoulderXLine) {
      return front ? "right arm" : "left arm";
    } else if (centerX > midLine + shoulderXLine) {
      return front ? "left arm" : "right arm";
    }
  }

  return "";
}

export function LazarusLocationSelectorWrapper({
  onSelectionChange,
  onClose,
  labels,
}: LazarusLocationSelectorWrapperProps) {
  const [sex, setSex] = useState<LazarusFigureGender>("neutral");
  const [front, setFront] = useState<boolean>(true);
  const [isZoomed, setIsZoomed] = useState<boolean>(false);
  const [selectorX, setSelectorX] = useState<number>(39);
  const [selectorY, setSelectorY] = useState<number>(34);
  const [selectorWidth] = useState<number>(22);
  const [selectorHeight] = useState<number>(15);
  const [currentPart, setCurrentPart] = useState<string>(() =>
    determineLazarusBodyPart(39, 34, 22, 15, true, "neutral"),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef<boolean>(false);

  const imageSrc =
    sex === "neutral"
      ? front
        ? "/lazarus/neutralFront.png"
        : "/lazarus/neutralBack.png"
      : sex === "female"
        ? front
          ? "/lazarus/womanFront.png"
          : "/lazarus/womanBack.png"
        : front
          ? "/lazarus/manFront.png"
          : "/lazarus/manBack.png";

  const updateLocation = useCallback(
    (x: number, y: number, isFront: boolean, currentSex: LazarusFigureGender) => {
      const part = determineLazarusBodyPart(x, y, selectorWidth, selectorHeight, isFront, currentSex);
      setCurrentPart(part);
      const mapped = mapLazarusToCanonical(part);
      onSelectionChange(mapped.region, mapped.subregion, part);
    },
    [selectorWidth, selectorHeight, onSelectionChange],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickXPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const clickYPercent = ((e.clientY - rect.top) / rect.height) * 100;

    const newX = Math.max(0, Math.min(100 - selectorWidth, clickXPercent - selectorWidth / 2));
    const newY = Math.max(0, Math.min(100 - selectorHeight, clickYPercent - selectorHeight / 2));

    setSelectorX(newX);
    setSelectorY(newY);
    isDraggingRef.current = true;
    updateLocation(newX, newY, front, sex);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickXPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const clickYPercent = ((e.clientY - rect.top) / rect.height) * 100;

    const newX = Math.max(0, Math.min(100 - selectorWidth, clickXPercent - selectorWidth / 2));
    const newY = Math.max(0, Math.min(100 - selectorHeight, clickYPercent - selectorHeight / 2));

    setSelectorX(newX);
    setSelectorY(newY);
    updateLocation(newX, newY, front, sex);
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  const toggleFrontBack = () => {
    const nextFront = !front;
    setFront(nextFront);
    updateLocation(selectorX, selectorY, nextFront, sex);
  };

  const toggleSex = (newSex: LazarusFigureGender) => {
    setSex(newSex);
    updateLocation(selectorX, selectorY, front, newSex);
  };


  return (
    <div className="lazarus-container" aria-label={labels.pinpointTitle}>
      {/* Top Toolbar */}
      <div className="lazarus-header flex space-between align-center">
        <button
          type="button"
          className="lazarus-button lazarus-button--cancel"
          onClick={onClose}
          aria-label={labels.cancel}
        >
          ✕ {labels.cancel}
        </button>

        <div className="lazarus-view-toggles flex gap-2">
          <button
            type="button"
            className={`body-view-toggle__button ${front ? "body-view-toggle__button--active" : ""}`}
            onClick={() => {
              if (!front) toggleFrontBack();
            }}
            aria-pressed={front}
          >
            {labels.flipToFront}
          </button>
          <button
            type="button"
            className={`body-view-toggle__button ${!front ? "body-view-toggle__button--active" : ""}`}
            onClick={() => {
              if (front) toggleFrontBack();
            }}
            aria-pressed={!front}
          >
            {labels.flipToBack}
          </button>
        </div>

        <div className="lazarus-sex-toggles flex gap-2">
          <button
            type="button"
            className={`body-view-toggle__button ${sex === "neutral" ? "body-view-toggle__button--active" : ""}`}
            onClick={() => toggleSex("neutral")}
            aria-pressed={sex === "neutral"}
          >
            {labels.neutral}
          </button>
          <button
            type="button"
            className={`body-view-toggle__button ${sex === "male" ? "body-view-toggle__button--active" : ""}`}
            onClick={() => toggleSex("male")}
            aria-pressed={sex === "male"}
          >
            {labels.male}
          </button>
          <button
            type="button"
            className={`body-view-toggle__button ${sex === "female" ? "body-view-toggle__button--active" : ""}`}
            onClick={() => toggleSex("female")}
            aria-pressed={sex === "female"}
          >
            {labels.female}
          </button>
        </div>
      </div>

      <p className="lazarus-instruction text-sm text-slate-600 text-center my-2">
        {labels.zoomInstruction}
      </p>

      {/* Main Interactive Stage with Explicit Height */}
      <div
        ref={containerRef}
        className={`lazarus-stage ${isZoomed ? "lazarus-stage--zoomed" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{
          touchAction: "none",
        }}
      >
        <div
          className="lazarus-viewport"
          style={
            isZoomed
              ? {
                  transform: `scale(2.4) translate(${-(selectorX - 35)}%, ${-(selectorY - 35)}%)`,
                  transformOrigin: "center center",
                  transition: "transform 300ms ease-out",
                }
              : {
                  transform: "scale(1)",
                  transition: "transform 300ms ease-out",
                }
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={front ? "Body diagram front view" : "Body diagram back view"}
            className="lazarus-image"
            draggable={false}
          />

          {/* Interactive Selection Reticle (matches Lazarus crop box) */}
          <div
            className="lazarus-target-box"
            style={{
              left: `${selectorX}%`,
              top: `${selectorY}%`,
              width: `${selectorWidth}%`,
              height: `${selectorHeight}%`,
            }}
          >
            <div className="lazarus-target-crosshair" />
          </div>
        </div>
      </div>

      {/* Location Status Bar */}
      <div className="lazarus-status-bar flex space-between align-center my-3 p-3 bg-slate-100 rounded-lg">
        <div className="lazarus-selection-info">
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold block">
            {labels.selectedLocation}:
          </span>
          <span className="text-base font-bold text-slate-900 capitalize">
            {currentPart || labels.noAreaSelected}
          </span>
        </div>

        <div className="lazarus-action-buttons flex gap-2">
          <button
            type="button"
            className="secondary-button lazarus-zoom-btn text-sm py-1.5 px-3"
            onClick={() => setIsZoomed(!isZoomed)}
          >
            {isZoomed ? labels.zoomOut : labels.zoomIn}
          </button>
          <button
            type="button"
            className="primary-button text-sm py-1.5 px-4"
            onClick={onClose}
          >
            {labels.confirm}
          </button>
        </div>
      </div>
    </div>
  );
}
