import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Chess, Color, Square } from "chess.js";
import type { Settings } from "@/lib/settings";
import { getCameraPresetMeta } from "./assets3d";
import {
  BOARD_SURFACE_Y,
  createChessBoard3D,
  PIECE_LIFT_HEIGHT,
  type ChessBoard3DController,
} from "./Board3D";
import { createChessClock3D, type ChessClockController } from "./ChessClock3D";
import { createEnvironment3D, type Environment3DController } from "./Environment3D";

export interface ChessViewport3DProps {
  game: Chess;
  fen: string;
  flipped: boolean;
  disabled: boolean;
  lastMove: { from: Square; to: Square } | null;
  onAttemptMove: (from: Square, to: Square) => boolean;
  activeSide: Color;
  whiteTimeMs?: number | null;
  blackTimeMs?: number | null;
  activeClockSide?: Color;
  playerSide?: Color;
  needsClockPunch?: boolean;
  onClockPunch?: () => void;
  settings: Settings;
  cameraResetSeq: number;
  onContextError: () => void;
}

function detectSoftwareGl(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (!ext) return false;
    const rendererStr = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "");
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(rendererStr);
  } catch {
    return false;
  }
}

export default function ChessViewport3D({
  game,
  fen,
  flipped,
  disabled,
  lastMove,
  onAttemptMove,
  activeSide,
  whiteTimeMs = null,
  blackTimeMs = null,
  activeClockSide,
  playerSide,
  needsClockPunch = false,
  onClockPunch,
  settings,
  cameraResetSeq,
  onContextError,
}: ChessViewport3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Latest React props kept in ref so the Three.js loop never tears down on moves
  const stateRef = useRef({
    game,
    fen,
    flipped,
    disabled,
    lastMove,
    onAttemptMove,
    activeSide,
    whiteTimeMs,
    blackTimeMs,
    activeClockSide,
    playerSide,
    needsClockPunch,
    onClockPunch,
    settings,
    onContextError,
  });
  stateRef.current = {
    game,
    fen,
    flipped,
    disabled,
    lastMove,
    onAttemptMove,
    activeSide,
    whiteTimeMs,
    blackTimeMs,
    activeClockSide,
    playerSide,
    needsClockPunch,
    onClockPunch,
    settings,
    onContextError,
  };

  // Selection state managed inside Three.js runtime + synced with React updates
  const selectedSquareRef = useRef<Square | null>(null);
  const legalTargetsRef = useRef<Set<string>>(new Set());

  // Sync flags for hot-swapping settings inside rAF
  const dirtyFlagsRef = useRef({
    syncBoard: true,
    syncEnv: false,
    syncClock: false,
    syncCamera: false,
  });

  // Mark board dirty when game / move / visual settings change
  useEffect(() => {
    selectedSquareRef.current = null;
    legalTargetsRef.current = new Set();
    dirtyFlagsRef.current.syncBoard = true;
  }, [fen, flipped, disabled, lastMove, settings.boardMaterial3D, settings.pieceDesign3D]);

  useEffect(() => {
    dirtyFlagsRef.current.syncEnv = true;
  }, [settings.environment3D, settings.graphicsQuality3D]);

  useEffect(() => {
    dirtyFlagsRef.current.syncClock = true;
    dirtyFlagsRef.current.syncCamera = true;
  }, [settings.clockStyle3D, settings.clockSide3D]);

  useEffect(() => {
    dirtyFlagsRef.current.syncCamera = true;
  }, [settings.cameraPreset3D, settings.boardSize, cameraResetSeq]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      // Probe antialias safely via context creation
      const probeCanvas = document.createElement("canvas");
      const probeGl = probeCanvas.getContext("webgl2") || probeCanvas.getContext("webgl");
      if (!probeGl) {
        stateRef.current.onContextError();
        return;
      }
      const isSoftwareGl = detectSoftwareGl(probeGl);

      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: "high-performance",
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.04;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setPixelRatio(
        isSoftwareGl
          ? 1
          : Math.min(window.devicePixelRatio || 1, settings.graphicsQuality3D === "low" ? 1.25 : 2),
      );
      const initW = Math.max(container.clientWidth, 320);
      const initH = Math.max(container.clientHeight, 320);
      renderer.setSize(initW, initH);

      const canvas = renderer.domElement;
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.touchAction = "none";
      container.innerHTML = "";
      container.appendChild(canvas);

      const maxAniso = isSoftwareGl ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const scene = new THREE.Scene();

      const applyClockPlacement = (clockGroup: THREE.Group, side: Settings["clockSide3D"]) => {
        if (side === "left") {
          // Parallel to board outside file a, facing inward (+X) with subtle cant toward player
          clockGroup.position.set(-5.42, 0.04, 0);
          clockGroup.rotation.set(0, Math.PI / 2 - 0.2, 0);
        } else {
          // Parallel to board outside file h, facing inward (-X) with subtle cant toward player
          clockGroup.position.set(5.42, 0.04, 0);
          clockGroup.rotation.set(0, -Math.PI / 2 + 0.2, 0);
        }
      };

      const computeFramedCamera = (
        preset: Settings["cameraPreset3D"],
        clockSide: Settings["clockSide3D"],
        boardSizePct: number,
      ) => {
        const meta = getCameraPresetMeta(preset);
        const sideShift = clockSide === "left" ? -0.5 : 0.5;
        const targetX = meta.target[0] + sideShift;
        const targetY = meta.target[1];
        const targetZ = meta.target[2];
        const rawPosX =
          preset === "perspective_angled"
            ? (clockSide === "left" ? 1 : -1) * Math.abs(meta.position[0]) + sideShift * 0.4
            : meta.position[0] + sideShift;
        const clampedPct = Math.max(70, Math.min(160, boardSizePct || 100));
        const zoomMult = THREE.MathUtils.clamp(Math.pow(100 / clampedPct, 0.52), 0.72, 1.24);
        return {
          fov: meta.fov,
          pos: [
            targetX + (rawPosX - targetX) * zoomMult,
            targetY + (meta.position[1] - targetY) * zoomMult,
            targetZ + (meta.position[2] - targetZ) * zoomMult,
          ] as [number, number, number],
          target: [targetX, targetY, targetZ] as [number, number, number],
        };
      };

      const initCam = computeFramedCamera(
        stateRef.current.settings.cameraPreset3D,
        stateRef.current.settings.clockSide3D,
        stateRef.current.settings.boardSize,
      );
      const camera = new THREE.PerspectiveCamera(initCam.fov, initW / initH, 0.1, 120);
      camera.position.set(...initCam.pos);

      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.target.set(...initCam.target);
      controls.minDistance = 4.6;
      controls.maxDistance = 17.5;
      controls.minPolarAngle = 0.12;
      controls.maxPolarAngle = Math.PI / 2 - 0.09; // never dip below the table
      controls.enablePan = false;
      controls.update();

      // Smooth camera transition target
      let camTransitioning = false;
      const desiredCamPos = new THREE.Vector3(...initCam.pos);
      const desiredTarget = new THREE.Vector3(...initCam.target);

      const onOrbitStart = () => {
        camTransitioning = false;
      };
      controls.addEventListener("start", onOrbitStart);

      // Build modular 3D subsystems
      let envCtrl: Environment3DController = createEnvironment3D(
        stateRef.current.settings.environment3D,
        stateRef.current.settings.graphicsQuality3D,
        renderer,
        scene,
        isSoftwareGl,
        maxAniso,
      );
      scene.add(envCtrl.group);

      const boardCtrl: ChessBoard3DController = createChessBoard3D(
        stateRef.current.settings.boardMaterial3D,
        stateRef.current.settings.pieceDesign3D,
        maxAniso,
      );
      scene.add(boardCtrl.group);

      let clockCtrl: ChessClockController = createChessClock3D(
        stateRef.current.settings.clockStyle3D,
        maxAniso,
      );
      applyClockPlacement(clockCtrl.group, stateRef.current.settings.clockSide3D);
      scene.add(clockCtrl.group);

      // Initial sync
      boardCtrl.syncGame(stateRef.current.game, {
        flipped: stateRef.current.flipped,
        lastMove: stateRef.current.lastMove,
        selected: null,
        legalTargets: new Set(),
        animations: false,
        disabled: stateRef.current.disabled,
      });

      // Pointer raycasting: 3D piece drag-and-drop (>= 6px) + click-to-move fallback (< 6px)
      const raycaster = new THREE.Raycaster();
      const pointerNDC = new THREE.Vector2();
      const dragPlane = new THREE.Plane(
        new THREE.Vector3(0, 1, 0),
        -(BOARD_SURFACE_Y + PIECE_LIFT_HEIGHT),
      );
      const dragPlaneHit = new THREE.Vector3();

      let downX = 0;
      let downY = 0;
      let downTime = 0;
      let pointerDownActive = false;
      let activePointerId: number | null = null;
      let dragCandidateSq: Square | null = null;
      let isDraggingPiece = false;
      let dragLegalTargets: Set<string> = new Set();
      let currentHoverSq: Square | null = null;

      const setPointerNDC = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      };

      const computeLegalTargets = (sq: Square): Set<string> => {
        const moves = stateRef.current.game.moves({ square: sq, verbose: true }) as Array<{
          to: string;
        }>;
        return new Set(moves.map((m) => m.to));
      };

      const isDraggablePieceSquare = (sq: Square | null): sq is Square => {
        if (!sq || stateRef.current.disabled) return false;
        const piece = stateRef.current.game.get(sq);
        if (!piece || piece.color !== stateRef.current.game.turn()) return false;
        const pSide = stateRef.current.playerSide;
        if (pSide && piece.color !== pSide) return false;
        return true;
      };

      const releaseDragLock = () => {
        controls.enabled = true;
        if (activePointerId !== null) {
          try {
            if (canvas.hasPointerCapture?.(activePointerId)) {
              canvas.releasePointerCapture(activePointerId);
            }
          } catch {
            /* ignore */
          }
          activePointerId = null;
        }
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        downX = e.clientX;
        downY = e.clientY;
        downTime = performance.now();
        pointerDownActive = true;
        isDraggingPiece = false;
        dragCandidateSq = null;
        currentHoverSq = null;

        if (stateRef.current.disabled) return;

        setPointerNDC(e);
        raycaster.setFromCamera(pointerNDC, camera);

        // Allow direct click on 3D clock when awaiting manual punch (even if piece check skipped)
        if (stateRef.current.needsClockPunch) {
          const clockHits = raycaster.intersectObjects(clockCtrl.getInteractiveMeshes(), false);
          if (clockHits.length > 0) return;
        }

        // Check piece 3D mesh first (handles tall pieces at seated angles), then square tile
        const hitPieceSq = boardCtrl.pickPieceSquare(raycaster);
        const hitSq = hitPieceSq ?? boardCtrl.pickSquare(raycaster);

        // If another piece is already selected and user clicked a legal capture square
        // containing an enemy piece, hitSq is enemy -> not draggable -> handled as click-to-capture
        if (isDraggablePieceSquare(hitSq)) {
          const targets = computeLegalTargets(hitSq);
          dragCandidateSq = hitSq;
          dragLegalTargets = targets;
          // Temporarily disable OrbitControls so dragging a piece never orbits the camera
          controls.enabled = false;
          activePointerId = e.pointerId;
          try {
            canvas.setPointerCapture?.(e.pointerId);
          } catch {
            /* ignore */
          }
          e.stopPropagation();
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        setPointerNDC(e);
        raycaster.setFromCamera(pointerNDC, camera);

        if (pointerDownActive && dragCandidateSq) {
          if (stateRef.current.disabled) {
            if (isDraggingPiece) boardCtrl.cancelDrag();
            isDraggingPiece = false;
            dragCandidateSq = null;
            pointerDownActive = false;
            releaseDragLock();
            return;
          }

          if (!isDraggingPiece) {
            const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
            if (dist >= 6) {
              isDraggingPiece = true;
              controls.enabled = false;
              selectedSquareRef.current = dragCandidateSq;
              legalTargetsRef.current = dragLegalTargets;
              boardCtrl.startDrag(dragCandidateSq, dragLegalTargets);
              canvas.style.cursor = "grabbing";
            }
          }

          if (isDraggingPiece) {
            if (raycaster.ray.intersectPlane(dragPlane, dragPlaneHit)) {
              currentHoverSq = boardCtrl.moveDragToWorldPoint(dragPlaneHit, dragLegalTargets);
            }
            canvas.style.cursor = "grabbing";
            return;
          }
        }

        if (stateRef.current.needsClockPunch) {
          const clockHits = raycaster.intersectObjects(clockCtrl.getInteractiveMeshes(), false);
          if (clockHits.length > 0) {
            canvas.style.cursor = "pointer";
            return;
          }
        }

        if (stateRef.current.disabled) {
          canvas.style.cursor = "grab";
          return;
        }

        const hoverPieceSq = boardCtrl.pickPieceSquare(raycaster);
        const sq = hoverPieceSq ?? boardCtrl.pickSquare(raycaster);
        if (sq) {
          const p = stateRef.current.game.get(sq);
          const pSide = stateRef.current.playerSide;
          const isFriendlyTurn =
            Boolean(p && p.color === stateRef.current.game.turn()) &&
            (!pSide || p?.color === pSide);
          const canInteract =
            isFriendlyTurn ||
            (selectedSquareRef.current !== null && legalTargetsRef.current.has(sq));
          canvas.style.cursor = canInteract ? "pointer" : "grab";
        } else {
          canvas.style.cursor = "grab";
        }
      };

      const finishPointer = (e: PointerEvent, cancelled: boolean) => {
        if (!pointerDownActive) return;
        pointerDownActive = false;
        releaseDragLock();

        // Was dragging a 3D piece (>= 6px movement)
        if (isDraggingPiece && dragCandidateSq) {
          const fromSq = dragCandidateSq;
          const validTargets = dragLegalTargets;
          let dropSq = currentHoverSq;
          if (!cancelled) {
            setPointerNDC(e);
            raycaster.setFromCamera(pointerNDC, camera);
            if (raycaster.ray.intersectPlane(dragPlane, dragPlaneHit)) {
              dropSq = boardCtrl.moveDragToWorldPoint(dragPlaneHit, validTargets);
            }
          }

          isDraggingPiece = false;
          dragCandidateSq = null;
          currentHoverSq = null;

          if (!cancelled && dropSq && dropSq !== fromSq && validTargets.has(dropSq)) {
            boardCtrl.commitDrop(dropSq);
            selectedSquareRef.current = null;
            legalTargetsRef.current = new Set();
            const moved = stateRef.current.onAttemptMove(fromSq, dropSq);
            if (!moved) {
              boardCtrl.cancelDrag();
            }
            dirtyFlagsRef.current.syncBoard = true;
          } else {
            // Dropped on illegal square, outside board, or cancelled -> spring smoothly back (~180ms)
            boardCtrl.cancelDrag();
            const quickSameSquare =
              !cancelled && dropSq === fromSq && performance.now() - downTime <= 220;
            if (quickSameSquare) {
              selectedSquareRef.current = fromSq;
              legalTargetsRef.current = validTargets;
            } else {
              selectedSquareRef.current = null;
              legalTargetsRef.current = new Set();
            }
            dirtyFlagsRef.current.syncBoard = true;
          }
          canvas.style.cursor = "grab";
          return;
        }

        const candidate = dragCandidateSq;
        dragCandidateSq = null;
        isDraggingPiece = false;
        currentHoverSq = null;

        if (cancelled) return;
        const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (dist > 6) return; // user orbited camera

        setPointerNDC(e);
        raycaster.setFromCamera(pointerNDC, camera);

        // Allow direct click on 3D clock / plunger when manual clock punch is awaited
        if (stateRef.current.needsClockPunch) {
          const clockHits = raycaster.intersectObjects(clockCtrl.getInteractiveMeshes(), false);
          if (clockHits.length > 0) {
            stateRef.current.onClockPunch?.();
            return;
          }
        }

        if (stateRef.current.disabled) return;

        // If a piece is already selected, prefer square tiles for move target (unless clicking a friendly piece)
        const currentSelected = selectedSquareRef.current;
        const pieceSq = boardCtrl.pickPieceSquare(raycaster);
        const tileSq = boardCtrl.pickSquare(raycaster);
        const clickedSq =
          currentSelected && tileSq && legalTargetsRef.current.has(tileSq)
            ? tileSq
            : (candidate ?? pieceSq ?? tileSq);

        if (!clickedSq) {
          if (currentSelected) {
            selectedSquareRef.current = null;
            legalTargetsRef.current = new Set();
            dirtyFlagsRef.current.syncBoard = true;
          }
          return;
        }

        if (currentSelected && currentSelected === clickedSq) {
          selectedSquareRef.current = null;
          legalTargetsRef.current = new Set();
          dirtyFlagsRef.current.syncBoard = true;
          return;
        }

        if (currentSelected && legalTargetsRef.current.has(clickedSq)) {
          const moved = stateRef.current.onAttemptMove(currentSelected, clickedSq);
          if (moved) {
            selectedSquareRef.current = null;
            legalTargetsRef.current = new Set();
            dirtyFlagsRef.current.syncBoard = true;
            return;
          }
        }

        const piece = stateRef.current.game.get(clickedSq);
        const pSide = stateRef.current.playerSide;
        if (
          piece &&
          piece.color === stateRef.current.game.turn() &&
          (!pSide || piece.color === pSide)
        ) {
          selectedSquareRef.current = clickedSq;
          legalTargetsRef.current = computeLegalTargets(clickedSq);
          dirtyFlagsRef.current.syncBoard = true;
        } else if (currentSelected) {
          selectedSquareRef.current = null;
          legalTargetsRef.current = new Set();
          dirtyFlagsRef.current.syncBoard = true;
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        if (e.button !== 0) return;
        finishPointer(e, false);
      };

      const onPointerCancel = (e: PointerEvent) => {
        finishPointer(e, true);
      };

      // Capture phase on pointerdown lets us lock OrbitControls before it handles the down event
      canvas.addEventListener("pointerdown", onPointerDown, true);
      canvas.addEventListener("pointerup", onPointerUp);
      canvas.addEventListener("pointercancel", onPointerCancel);
      canvas.addEventListener("pointermove", onPointerMove);

      // Resize observer
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const w = Math.max(1, Math.floor(entry.contentRect.width));
        const h = Math.max(1, Math.floor(entry.contentRect.height));
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      });
      resizeObserver.observe(container);

      // Context loss handler
      const onContextLost = (e: Event) => {
        e.preventDefault();
        stateRef.current.onContextError();
      };
      canvas.addEventListener("webglcontextlost", onContextLost);

      // Animation loop
      let rafId = 0;
      let disposed = false;
      let lastTime = performance.now();

      const tick = (now: number) => {
        if (disposed) return;
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        const cur = stateRef.current;
        const s = cur.settings;

        // Hot-swap environment / quality
        if (dirtyFlagsRef.current.syncEnv) {
          dirtyFlagsRef.current.syncEnv = false;
          scene.remove(envCtrl.group);
          envCtrl.dispose();
          envCtrl = createEnvironment3D(
            s.environment3D,
            s.graphicsQuality3D,
            renderer,
            scene,
            isSoftwareGl,
            maxAniso,
          );
          scene.add(envCtrl.group);
          renderer.setPixelRatio(
            isSoftwareGl
              ? 1
              : Math.min(window.devicePixelRatio || 1, s.graphicsQuality3D === "low" ? 1.25 : 2),
          );
        }

        // Hot-swap clock style or placement side
        if (dirtyFlagsRef.current.syncClock) {
          dirtyFlagsRef.current.syncClock = false;
          if (clockCtrl.style !== s.clockStyle3D) {
            scene.remove(clockCtrl.group);
            clockCtrl.dispose();
            clockCtrl = createChessClock3D(s.clockStyle3D, maxAniso);
            scene.add(clockCtrl.group);
          }
          applyClockPlacement(clockCtrl.group, s.clockSide3D);
        }

        // Hot-swap camera preset / clock-aware framing / scale zoom
        if (dirtyFlagsRef.current.syncCamera) {
          dirtyFlagsRef.current.syncCamera = false;
          const nextCam = computeFramedCamera(s.cameraPreset3D, s.clockSide3D, s.boardSize);
          desiredCamPos.set(...nextCam.pos);
          desiredTarget.set(...nextCam.target);
          camera.fov = nextCam.fov;
          camera.updateProjectionMatrix();
          camTransitioning = true;
        }

        // Sync board & pieces
        if (dirtyFlagsRef.current.syncBoard) {
          dirtyFlagsRef.current.syncBoard = false;
          boardCtrl.setAppearance(s.boardMaterial3D, s.pieceDesign3D, maxAniso);
          boardCtrl.syncGame(cur.game, {
            flipped: cur.flipped,
            lastMove: cur.lastMove,
            selected: selectedSquareRef.current,
            legalTargets: legalTargetsRef.current,
            animations: s.animations,
            disabled: cur.disabled,
          });
        }

        // Smooth camera preset damping
        if (camTransitioning) {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredCamPos.x, 7, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredCamPos.y, 7, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredCamPos.z, 7, dt);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, desiredTarget.x, 7, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, desiredTarget.y, 7, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, desiredTarget.z, 7, dt);
          if (
            camera.position.distanceToSquared(desiredCamPos) < 0.001 &&
            controls.target.distanceToSquared(desiredTarget) < 0.001
          ) {
            camera.position.copy(desiredCamPos);
            controls.target.copy(desiredTarget);
            camTransitioning = false;
          }
        }

        // Safety guard: if game becomes disabled while holding a piece, spring it back immediately
        if (cur.disabled && boardCtrl.isDraggingPiece()) {
          boardCtrl.cancelDrag();
          isDraggingPiece = false;
          dragCandidateSq = null;
          pointerDownActive = false;
          releaseDragLock();
        }

        boardCtrl.update(dt);
        clockCtrl.update(
          dt,
          {
            whiteMs: cur.whiteTimeMs ?? null,
            blackMs: cur.blackTimeMs ?? null,
            activeSide: cur.activeClockSide ?? cur.activeSide,
            playerSide: cur.playerSide ?? (cur.flipped ? "b" : "w"),
            needsPunch: Boolean(cur.needsClockPunch),
            flipped: cur.flipped,
            clockSide: s.clockSide3D,
            isGameOver: cur.game.isGameOver() || cur.game.history().length === 0,
          },
          now / 1000,
        );
        controls.update();
        renderer.render(scene, camera);

        if (isSoftwareGl) {
          const gl = renderer.getContext();
          const sync = (gl as WebGL2RenderingContext).fenceSync?.(
            (gl as WebGL2RenderingContext).SYNC_GPU_COMMANDS_COMPLETE,
            0,
          );
          if (sync) {
            (gl as WebGL2RenderingContext).deleteSync(sync);
          }
        }
        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);

      return () => {
        disposed = true;
        cancelAnimationFrame(rafId);
        resizeObserver.disconnect();
        controls.removeEventListener("start", onOrbitStart);
        controls.dispose();
        canvas.removeEventListener("pointerdown", onPointerDown, true);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerCancel);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("webglcontextlost", onContextLost);
        boardCtrl.dispose();
        clockCtrl.dispose();
        envCtrl.dispose();
        renderer.dispose();
        container.innerHTML = "";
      };
    } catch {
      stateRef.current.onContextError();
      return;
    }
    // Intentionally mounted once per viewport lifecycle; settings updates sync via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="w-full h-full select-none" />;
}
