import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── CONSTANTS ───
const GRID = 8;
const SHIPS = [
  { name: "Typhoon", size: 5, id: "typhoon" },
  { name: "Akula", size: 4, id: "akula" },
  { name: "Seawolf", size: 3, id: "seawolf" },
  { name: "Virginia", size: 3, id: "virginia" },
  { name: "Midget Sub", size: 2, id: "midget" },
];
const COLS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const DEPTHS = ["D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8"];

// ─── CRT STYLES ───
const CRT_GREEN = "#33ff33";
const CRT_GREEN_DIM = "#1a8a1a";
const CRT_GREEN_DARK = "#0d4d0d";
const CRT_RED = "#ff3333";
const CRT_ORANGE = "#ff8833";
const CRT_YELLOW = "#ffff33";
const CRT_BG = "#0a0a0a";
const CRT_PANEL = "#0d120d";

// ─── HELPER: Generate empty grid ───
function emptyGrid() {
  const g = [];
  for (let z = 0; z < GRID; z++) {
    const layer = [];
    for (let y = 0; y < GRID; y++) {
      const row = [];
      for (let x = 0; x < GRID; x++) {
        row.push({ state: "empty", shipId: null });
      }
      layer.push(row);
    }
    g.push(layer);
  }
  return g;
}

// ─── HELPER: coord string ───
function coordStr(x, y, z) {
  return `${COLS[x]}-${y + 1}-D${z + 1}`;
}

// ─── HELPER: Check if placement valid ───
function canPlace(grid, x, y, z, axis, size) {
  for (let i = 0; i < size; i++) {
    let cx = x, cy = y, cz = z;
    if (axis === "x") cx = x + i;
    else if (axis === "y") cy = y + i;
    else cz = z + i;
    if (cx >= GRID || cy >= GRID || cz >= GRID) return false;
    if (grid[cz][cy][cx].state !== "empty") return false;
  }
  return true;
}

function placeShip(grid, x, y, z, axis, size, shipId) {
  const g = JSON.parse(JSON.stringify(grid));
  for (let i = 0; i < size; i++) {
    let cx = x, cy = y, cz = z;
    if (axis === "x") cx = x + i;
    else if (axis === "y") cy = y + i;
    else cz = z + i;
    g[cz][cy][cx] = { state: "ship", shipId };
  }
  return g;
}

// ─── HELPER: Random placement for AI ───
function randomPlacement() {
  let grid = emptyGrid();
  const axes = ["x", "y", "z"];
  for (const ship of SHIPS) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 500) {
      const ax = axes[Math.floor(Math.random() * 3)];
      const x = Math.floor(Math.random() * GRID);
      const y = Math.floor(Math.random() * GRID);
      const z = Math.floor(Math.random() * GRID);
      if (canPlace(grid, x, y, z, ax, ship.size)) {
        grid = placeShip(grid, x, y, z, ax, ship.size, ship.id);
        placed = true;
      }
      attempts++;
    }
  }
  // place decoy
  let decoyPlaced = false;
  while (!decoyPlaced) {
    const x = Math.floor(Math.random() * GRID);
    const y = Math.floor(Math.random() * GRID);
    const z = Math.floor(Math.random() * GRID);
    if (grid[z][y][x].state === "empty") {
      grid[z][y][x] = { state: "decoy", shipId: "decoy" };
      decoyPlaced = true;
    }
  }
  return grid;
}

// ─── SCANLINE OVERLAY COMPONENT ───
function Scanlines() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        zIndex: 9999,
        background:
          "repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px, transparent 1px, transparent 3px)",
        mixBlendMode: "multiply",
      }}
    />
  );
}

// ─── CRT VIGNETTE ───
function CRTVignette() {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: "none",
        zIndex: 9998,
        background:
          "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)",
      }}
    />
  );
}

// ─── FLICKER ANIMATION ───
function useFlicker() {
  const [opacity, setOpacity] = useState(1);
  useEffect(() => {
    const id = setInterval(() => {
      setOpacity(0.97 + Math.random() * 0.03);
    }, 100);
    return () => clearInterval(id);
  }, []);
  return opacity;
}

// ─── SONAR SWEEP ANIMATION ───
function SonarSweep({ active }) {
  const [angle, setAngle] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setAngle((a) => (a + 3) % 360), 30);
    return () => clearInterval(id);
  }, [active]);
  if (!active) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        width: 300,
        height: 300,
        marginLeft: -150,
        marginTop: -150,
        borderRadius: "50%",
        border: `1px solid ${CRT_GREEN_DIM}`,
        overflow: "hidden",
        opacity: 0.3,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: "50%",
          height: "50%",
          transformOrigin: "0% 100%",
          transform: `rotate(${angle}deg)`,
          background: `linear-gradient(${angle}deg, ${CRT_GREEN}44, transparent)`,
        }}
      />
    </div>
  );
}

// ─── TITLE SCREEN ───
function TitleScreen({ onStart }) {
  const [blink, setBlink] = useState(true);
  const flicker = useFlicker();
  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 800);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        opacity: flicker,
        position: "relative",
      }}
    >
      <SonarSweep active />
      <div
        style={{
          fontSize: 11,
          color: CRT_GREEN_DIM,
          letterSpacing: 6,
          marginBottom: 8,
          fontFamily: "'Silkscreen', monospace",
        }}
      >
        ◆ SONAR COMMAND ◆
      </div>
      <div
        style={{
          fontSize: 64,
          fontFamily: "'Press Start 2P', monospace",
          color: CRT_GREEN,
          textShadow: `0 0 20px ${CRT_GREEN}, 0 0 40px ${CRT_GREEN}88, 0 0 80px ${CRT_GREEN}44`,
          letterSpacing: 12,
          marginBottom: 16,
        }}
      >
        CONTACT
      </div>
      <div
        style={{
          fontSize: 12,
          color: CRT_GREEN_DIM,
          letterSpacing: 4,
          fontFamily: "'Silkscreen', monospace",
          marginBottom: 48,
        }}
      >
        3D NAVAL COMBAT // v1.0
      </div>
      <div
        style={{
          width: 320,
          borderTop: `1px solid ${CRT_GREEN_DIM}`,
          borderBottom: `1px solid ${CRT_GREEN_DIM}`,
          padding: "16px 0",
          textAlign: "center",
          marginBottom: 48,
        }}
      >
        <div style={{ fontSize: 10, color: CRT_GREEN_DIM, marginBottom: 8, fontFamily: "'Silkscreen', monospace" }}>
          FLEET MANIFEST
        </div>
        {SHIPS.map((s) => (
          <div
            key={s.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "3px 20px",
              fontSize: 10,
              color: CRT_GREEN,
              fontFamily: "'Silkscreen', monospace",
            }}
          >
            <span>{s.name.toUpperCase()}</span>
            <span>{"█".repeat(s.size)}{"░".repeat(5 - s.size)}</span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "3px 20px",
            fontSize: 10,
            color: CRT_YELLOW,
            fontFamily: "'Silkscreen', monospace",
            marginTop: 4,
            borderTop: `1px solid ${CRT_GREEN_DARK}`,
            paddingTop: 6,
          }}
        >
          <span>DECOY</span>
          <span>◊</span>
        </div>
      </div>
      <button
        onClick={onStart}
        style={{
          background: "transparent",
          border: `2px solid ${CRT_GREEN}`,
          color: CRT_GREEN,
          padding: "14px 48px",
          fontSize: 16,
          fontFamily: "'Press Start 2P', monospace",
          cursor: "pointer",
          textShadow: `0 0 10px ${CRT_GREEN}`,
          boxShadow: `0 0 15px ${CRT_GREEN}44, inset 0 0 15px ${CRT_GREEN}22`,
          opacity: blink ? 1 : 0.6,
          transition: "opacity 0.3s",
          letterSpacing: 4,
        }}
        onMouseEnter={(e) => {
          e.target.style.background = `${CRT_GREEN}22`;
        }}
        onMouseLeave={(e) => {
          e.target.style.background = "transparent";
        }}
      >
        ENGAGE
      </button>
      <div
        style={{
          position: "absolute",
          bottom: 24,
          fontSize: 9,
          color: CRT_GREEN_DARK,
          fontFamily: "'Silkscreen', monospace",
          letterSpacing: 3,
        }}
      >
        CLASSIFIED // TWO PLAYERS // LOCAL SESSION
      </div>
    </div>
  );
}

// ─── DEPTH LAYER GRID (SLICE VIEW) ───
function SliceGrid({ grid, depth, mode, onCellClick, onCellHover, hoveredCell, isTargeting, showShips }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {/* Column headers */}
      <div style={{ display: "flex", gap: 1, marginLeft: 24 }}>
        {COLS.map((c) => (
          <div
            key={c}
            style={{
              width: 36,
              height: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              color: CRT_GREEN_DIM,
              fontFamily: "'Silkscreen', monospace",
            }}
          >
            {c}
          </div>
        ))}
      </div>
      {Array.from({ length: GRID }, (_, y) => (
        <div key={y} style={{ display: "flex", gap: 1, alignItems: "center" }}>
          <div
            style={{
              width: 20,
              fontSize: 9,
              color: CRT_GREEN_DIM,
              fontFamily: "'Silkscreen', monospace",
              textAlign: "right",
              paddingRight: 4,
            }}
          >
            {y + 1}
          </div>
          {Array.from({ length: GRID }, (_, x) => {
            const cell = grid[depth][y][x];
            const isHovered =
              hoveredCell &&
              hoveredCell.x === x &&
              hoveredCell.y === y &&
              hoveredCell.z === depth;

            let bg = "transparent";
            let border = `1px solid ${CRT_GREEN_DARK}`;
            let content = "";
            let color = CRT_GREEN;
            let glow = "";
            let anim = {};

            if (cell.state === "ship" && showShips) {
              bg = `${CRT_GREEN}33`;
              border = `1px solid ${CRT_GREEN}88`;
              content = "■";
            } else if (cell.state === "decoy" && showShips) {
              bg = `${CRT_YELLOW}22`;
              border = `1px solid ${CRT_YELLOW}66`;
              content = "◊";
              color = CRT_YELLOW;
            } else if (cell.state === "hit") {
              bg = `${CRT_RED}22`;
              border = `1px solid ${CRT_RED}`;
              content = "×";
              color = CRT_RED;
              glow = `0 0 8px ${CRT_RED}`;
            } else if (cell.state === "miss") {
              content = "·";
              color = CRT_GREEN_DIM;
            } else if (cell.state === "sunk") {
              bg = `${CRT_ORANGE}22`;
              border = `1px solid ${CRT_ORANGE}`;
              content = "×";
              color = CRT_ORANGE;
            } else if (cell.state === "decoy_hit") {
              bg = `${CRT_YELLOW}22`;
              border = `1px solid ${CRT_YELLOW}`;
              content = "◊";
              color = CRT_YELLOW;
              anim = { animation: "blink 0.5s infinite" };
            }

            if (isHovered && cell.state === "empty") {
              bg = `${CRT_GREEN}18`;
              border = `1px solid ${CRT_GREEN}66`;
            }

            return (
              <div
                key={x}
                onClick={() => onCellClick && onCellClick(x, y, depth)}
                onMouseEnter={() => onCellHover && onCellHover(x, y, depth)}
                onMouseLeave={() => onCellHover && onCellHover(null)}
                style={{
                  width: 36,
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: bg,
                  border,
                  cursor: onCellClick ? "crosshair" : "default",
                  fontSize: 14,
                  color,
                  fontFamily: "'Press Start 2P', monospace",
                  textShadow: glow ? glow : "none",
                  transition: "all 0.15s",
                  ...anim,
                }}
              >
                {content}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── 3D CUBE VIEW (Isometric CSS) ───
function CubeView({ grid, selectedDepth, showShips, onSelectDepth }) {
  const cellSize = 8;
  const layerGap = 6;

  return (
    <div
      style={{
        position: "relative",
        width: 360,
        height: 360,
        margin: "0 auto",
        perspective: 800,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transform: "rotateX(35deg) rotateY(-30deg)",
        }}
      >
        {Array.from({ length: GRID }, (_, z) => {
          const isSelected = selectedDepth === z || selectedDepth === -1;
          const opacity = isSelected ? 1 : 0.15;
          return (
            <div
              key={z}
              onClick={() => onSelectDepth(z)}
              style={{
                position: "absolute",
                bottom: z * (cellSize * GRID + layerGap) * 0.4,
                left: "50%",
                marginLeft: -(cellSize * GRID) / 2 + z * 3,
                display: "grid",
                gridTemplateColumns: `repeat(${GRID}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${GRID}, ${cellSize}px)`,
                gap: 1,
                opacity,
                transition: "opacity 0.3s",
                cursor: "pointer",
              }}
            >
              {Array.from({ length: GRID * GRID }, (_, i) => {
                const x = i % GRID;
                const y = Math.floor(i / GRID);
                const cell = grid[z][y][x];
                let bg = `${CRT_GREEN_DARK}`;
                if (cell.state === "ship" && showShips) bg = CRT_GREEN + "88";
                if (cell.state === "hit") bg = CRT_RED + "aa";
                if (cell.state === "miss") bg = CRT_GREEN_DIM + "44";
                if (cell.state === "sunk") bg = CRT_ORANGE + "aa";
                return (
                  <div
                    key={i}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      background: bg,
                      border: `0.5px solid ${CRT_GREEN_DARK}44`,
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 4,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 9,
          color: CRT_GREEN_DIM,
          fontFamily: "'Silkscreen', monospace",
        }}
      >
        VOLUMETRIC DISPLAY // CLICK LAYER TO SELECT
      </div>
    </div>
  );
}

// ─── ABILITY TRAY ───
function AbilityTray({ abilities, onUse }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {abilities.map((ab) => (
        <button
          key={ab.id}
          onClick={() => ab.available && !ab.used && onUse(ab.id)}
          disabled={!ab.available || ab.used}
          style={{
            background: ab.used
              ? `${CRT_GREEN_DARK}44`
              : ab.available
              ? `${CRT_GREEN}11`
              : "transparent",
            border: `1px solid ${
              ab.used ? CRT_GREEN_DARK : ab.available ? CRT_GREEN : CRT_GREEN_DARK
            }`,
            color: ab.used
              ? CRT_GREEN_DARK
              : ab.available
              ? ab.type === "offensive"
                ? CRT_RED
                : CRT_GREEN
              : CRT_GREEN_DARK,
            padding: "6px 10px",
            fontSize: 8,
            fontFamily: "'Silkscreen', monospace",
            cursor: ab.available && !ab.used ? "pointer" : "not-allowed",
            opacity: ab.available || ab.used ? 1 : 0.4,
            textDecoration: ab.used ? "line-through" : "none",
            minWidth: 90,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 7, opacity: 0.6, marginBottom: 2 }}>
            {ab.type === "offensive" ? "▲ OFF" : "▼ DEF"}
          </div>
          {ab.name}
          {ab.used && " ✓"}
        </button>
      ))}
    </div>
  );
}

// ─── HANDOFF SCREEN ───
function HandoffScreen({ player, onReady }) {
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 600);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: CRT_GREEN_DIM,
          fontFamily: "'Silkscreen', monospace",
          marginBottom: 16,
          letterSpacing: 4,
        }}
      >
        ◆ SCREEN HANDOFF ◆
      </div>
      <div
        style={{
          fontSize: 36,
          fontFamily: "'Press Start 2P', monospace",
          color: CRT_GREEN,
          textShadow: `0 0 20px ${CRT_GREEN}`,
          marginBottom: 8,
        }}
      >
        {player === 0 ? "ALPHA" : "BRAVO"}
      </div>
      <div
        style={{
          fontSize: 10,
          color: CRT_GREEN_DIM,
          fontFamily: "'Silkscreen', monospace",
          marginBottom: 48,
        }}
      >
        COMMANDING OFFICER ON DECK
      </div>
      <button
        onClick={onReady}
        style={{
          background: "transparent",
          border: `2px solid ${CRT_GREEN}`,
          color: CRT_GREEN,
          padding: "12px 36px",
          fontSize: 14,
          fontFamily: "'Press Start 2P', monospace",
          cursor: "pointer",
          textShadow: `0 0 10px ${CRT_GREEN}`,
          opacity: blink ? 1 : 0.5,
          letterSpacing: 3,
        }}
      >
        READY
      </button>
    </div>
  );
}

// ─── SETUP SCREEN ───
function SetupScreen({ player, onComplete }) {
  const [grid, setGrid] = useState(emptyGrid);
  const [currentShip, setCurrentShip] = useState(0);
  const [axis, setAxis] = useState("x");
  const [depth, setDepth] = useState(0);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [placedDecoy, setPlacedDecoy] = useState(false);
  const allShipsPlaced = currentShip >= SHIPS.length;
  const placingDecoy = allShipsPlaced && !placedDecoy;

  const handleCellClick = (x, y, z) => {
    if (placingDecoy) {
      if (grid[z][y][x].state === "empty") {
        const g = JSON.parse(JSON.stringify(grid));
        g[z][y][x] = { state: "decoy", shipId: "decoy" };
        setGrid(g);
        setPlacedDecoy(true);
      }
      return;
    }
    if (allShipsPlaced) return;
    const ship = SHIPS[currentShip];
    if (canPlace(grid, x, y, z, axis, ship.size)) {
      const g = placeShip(grid, x, y, z, axis, ship.size, ship.id);
      setGrid(g);
      setCurrentShip(currentShip + 1);
    }
  };

  const handleHover = (x, y, z) => {
    if (x === null) {
      setHoveredCell(null);
    } else {
      setHoveredCell({ x, y, z });
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 700, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${CRT_GREEN_DARK}`,
          paddingBottom: 10,
          marginBottom: 16,
        }}
      >
        <div>
          <span
            style={{
              fontSize: 18,
              fontFamily: "'Press Start 2P', monospace",
              color: CRT_GREEN,
              textShadow: `0 0 10px ${CRT_GREEN}`,
            }}
          >
            {player === 0 ? "ALPHA" : "BRAVO"}
          </span>
          <span
            style={{
              fontSize: 10,
              color: CRT_GREEN_DIM,
              fontFamily: "'Silkscreen', monospace",
              marginLeft: 12,
            }}
          >
            FLEET DEPLOYMENT
          </span>
        </div>
        <div
          style={{
            fontSize: 9,
            color: CRT_GREEN_DIM,
            fontFamily: "'Silkscreen', monospace",
          }}
        >
          SETUP PHASE
        </div>
      </div>

      {/* Status */}
      <div
        style={{
          background: `${CRT_GREEN}08`,
          border: `1px solid ${CRT_GREEN_DARK}`,
          padding: "8px 14px",
          marginBottom: 16,
          fontSize: 10,
          color: placingDecoy ? CRT_YELLOW : CRT_GREEN,
          fontFamily: "'Silkscreen', monospace",
        }}
      >
        {placingDecoy
          ? "▶ PLACE DECOY — Click any empty cell"
          : allShipsPlaced && placedDecoy
          ? "▶ ALL UNITS DEPLOYED — CONFIRM TO PROCEED"
          : `▶ PLACE ${SHIPS[currentShip]?.name.toUpperCase()} (${SHIPS[currentShip]?.size} cells) — Axis: ${axis.toUpperCase()}`}
      </div>

      {/* Controls Row */}
      {!allShipsPlaced && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <span
            style={{
              fontSize: 9,
              color: CRT_GREEN_DIM,
              fontFamily: "'Silkscreen', monospace",
              alignSelf: "center",
            }}
          >
            AXIS:
          </span>
          {["x", "y", "z"].map((a) => (
            <button
              key={a}
              onClick={() => setAxis(a)}
              style={{
                background: axis === a ? `${CRT_GREEN}22` : "transparent",
                border: `1px solid ${axis === a ? CRT_GREEN : CRT_GREEN_DARK}`,
                color: axis === a ? CRT_GREEN : CRT_GREEN_DIM,
                padding: "4px 14px",
                fontSize: 10,
                fontFamily: "'Silkscreen', monospace",
                cursor: "pointer",
              }}
            >
              {a === "x" ? "COL (→)" : a === "y" ? "ROW (↓)" : "DEPTH (⊙)"}
            </button>
          ))}
        </div>
      )}

      {/* Depth selector */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {DEPTHS.map((d, i) => (
          <button
            key={i}
            onClick={() => setDepth(i)}
            style={{
              background: depth === i ? `${CRT_GREEN}22` : "transparent",
              border: `1px solid ${depth === i ? CRT_GREEN : CRT_GREEN_DARK}`,
              color: depth === i ? CRT_GREEN : CRT_GREEN_DIM,
              padding: "4px 8px",
              fontSize: 9,
              fontFamily: "'Silkscreen', monospace",
              cursor: "pointer",
              flex: 1,
            }}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
        <SliceGrid
          grid={grid}
          depth={depth}
          mode="setup"
          onCellClick={handleCellClick}
          onCellHover={(x, y, z) => handleHover(x, y, z)}
          hoveredCell={hoveredCell}
          isTargeting={false}
          showShips={true}
        />
      </div>

      {/* Ship roster */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
          justifyContent: "center",
        }}
      >
        {SHIPS.map((s, i) => (
          <div
            key={s.id}
            style={{
              padding: "4px 10px",
              border: `1px solid ${i < currentShip ? CRT_GREEN : i === currentShip ? CRT_GREEN : CRT_GREEN_DARK}`,
              background: i < currentShip ? `${CRT_GREEN}15` : "transparent",
              fontSize: 9,
              fontFamily: "'Silkscreen', monospace",
              color: i < currentShip ? CRT_GREEN : i === currentShip ? CRT_GREEN : CRT_GREEN_DARK,
            }}
          >
            {i < currentShip ? "✓ " : ""}
            {s.name.toUpperCase()} [{s.size}]
          </div>
        ))}
        <div
          style={{
            padding: "4px 10px",
            border: `1px solid ${placedDecoy ? CRT_YELLOW : placingDecoy ? CRT_YELLOW : CRT_GREEN_DARK}`,
            background: placedDecoy ? `${CRT_YELLOW}15` : "transparent",
            fontSize: 9,
            fontFamily: "'Silkscreen', monospace",
            color: placedDecoy ? CRT_YELLOW : placingDecoy ? CRT_YELLOW : CRT_GREEN_DARK,
          }}
        >
          {placedDecoy ? "✓ " : ""}DECOY
        </div>
      </div>

      {/* Confirm */}
      {allShipsPlaced && placedDecoy && (
        <div style={{ textAlign: "center" }}>
          <button
            onClick={() => onComplete(grid)}
            style={{
              background: "transparent",
              border: `2px solid ${CRT_GREEN}`,
              color: CRT_GREEN,
              padding: "10px 32px",
              fontSize: 12,
              fontFamily: "'Press Start 2P', monospace",
              cursor: "pointer",
              textShadow: `0 0 10px ${CRT_GREEN}`,
              letterSpacing: 3,
            }}
          >
            CONFIRM DEPLOYMENT
          </button>
        </div>
      )}
    </div>
  );
}

// ─── COMBAT SCREEN ───
function CombatScreen({ playerGrids, currentPlayer, onFire, onEndTurn, turnCount, shipHealth, abilities, onUseAbility, gameLog }) {
  const [viewMode, setViewMode] = useState("slice");
  const [depth, setDepth] = useState(0);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [boardView, setBoardView] = useState("targeting"); // "targeting" | "own"
  const [lastResult, setLastResult] = useState(null);

  const targetingGrid = playerGrids[currentPlayer].targeting;
  const ownGrid = playerGrids[currentPlayer].own;

  const displayGrid = boardView === "targeting" ? targetingGrid : ownGrid;
  const showShips = boardView === "own";

  const handleFire = (x, y, z) => {
    if (boardView !== "targeting") return;
    if (targetingGrid[z][y][x].state !== "empty") return;
    const result = onFire(x, y, z);
    setLastResult(result);
  };

  // Ship health display
  const opponentIdx = currentPlayer === 0 ? 1 : 0;

  return (
    <div style={{ padding: 12, maxWidth: 780, margin: "0 auto" }}>
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${CRT_GREEN_DARK}`,
          paddingBottom: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            style={{
              fontSize: 16,
              fontFamily: "'Press Start 2P', monospace",
              color: CRT_GREEN,
              textShadow: `0 0 10px ${CRT_GREEN}`,
            }}
          >
            {currentPlayer === 0 ? "ALPHA" : "BRAVO"}
          </span>
          <span
            style={{
              fontSize: 9,
              color: CRT_GREEN_DIM,
              fontFamily: "'Silkscreen', monospace",
            }}
          >
            COMBAT PHASE
          </span>
        </div>
        <div style={{ fontSize: 9, color: CRT_GREEN_DIM, fontFamily: "'Silkscreen', monospace" }}>
          TURN {turnCount}
        </div>
      </div>

      {/* Coordinate display */}
      <div
        style={{
          textAlign: "center",
          fontSize: 14,
          fontFamily: "'Press Start 2P', monospace",
          color: CRT_GREEN,
          marginBottom: 8,
          height: 20,
          textShadow: `0 0 8px ${CRT_GREEN}`,
        }}
      >
        {hoveredCell ? coordStr(hoveredCell.x, hoveredCell.y, hoveredCell.z) : "—"}
      </div>

      {/* View mode + board toggles */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: "cube", label: "CUBE" },
            { id: "slice", label: "SLICE" },
            { id: "xray", label: "X-RAY" },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              style={{
                background: viewMode === v.id ? `${CRT_GREEN}22` : "transparent",
                border: `1px solid ${viewMode === v.id ? CRT_GREEN : CRT_GREEN_DARK}`,
                color: viewMode === v.id ? CRT_GREEN : CRT_GREEN_DIM,
                padding: "4px 12px",
                fontSize: 9,
                fontFamily: "'Silkscreen', monospace",
                cursor: "pointer",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: "targeting", label: "TARGET" },
            { id: "own", label: "OWN FLEET" },
          ].map((b) => (
            <button
              key={b.id}
              onClick={() => setBoardView(b.id)}
              style={{
                background: boardView === b.id ? (b.id === "targeting" ? `${CRT_RED}22` : `${CRT_GREEN}22`) : "transparent",
                border: `1px solid ${boardView === b.id ? (b.id === "targeting" ? CRT_RED : CRT_GREEN) : CRT_GREEN_DARK}`,
                color: boardView === b.id ? (b.id === "targeting" ? CRT_RED : CRT_GREEN) : CRT_GREEN_DIM,
                padding: "4px 12px",
                fontSize: 9,
                fontFamily: "'Silkscreen', monospace",
                cursor: "pointer",
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {/* Depth selector */}
      {viewMode !== "cube" && (
        <div style={{ display: "flex", gap: 3, marginBottom: 8 }}>
          {DEPTHS.map((d, i) => (
            <button
              key={i}
              onClick={() => setDepth(i)}
              style={{
                background: depth === i ? `${CRT_GREEN}22` : "transparent",
                border: `1px solid ${depth === i ? CRT_GREEN : CRT_GREEN_DARK}`,
                color: depth === i ? CRT_GREEN : CRT_GREEN_DIM,
                padding: "3px 6px",
                fontSize: 9,
                fontFamily: "'Silkscreen', monospace",
                cursor: "pointer",
                flex: 1,
              }}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {/* Main viewport */}
      <div
        style={{
          border: `1px solid ${CRT_GREEN_DARK}`,
          background: `${CRT_BG}`,
          padding: 12,
          marginBottom: 10,
          minHeight: 320,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
        }}
      >
        {viewMode === "cube" ? (
          <CubeView
            grid={displayGrid}
            selectedDepth={depth}
            showShips={showShips}
            onSelectDepth={setDepth}
          />
        ) : (
          <SliceGrid
            grid={displayGrid}
            depth={depth}
            mode="combat"
            onCellClick={boardView === "targeting" ? handleFire : null}
            onCellHover={(x, y, z) =>
              x === null ? setHoveredCell(null) : setHoveredCell({ x, y, z })
            }
            hoveredCell={hoveredCell}
            isTargeting={boardView === "targeting"}
            showShips={showShips}
          />
        )}

        {/* Last result flash */}
        {lastResult && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              padding: "6px 14px",
              border: `2px solid ${lastResult.hit ? CRT_RED : CRT_GREEN_DIM}`,
              background: lastResult.hit ? `${CRT_RED}22` : `${CRT_GREEN}11`,
              color: lastResult.hit ? CRT_RED : CRT_GREEN_DIM,
              fontSize: 12,
              fontFamily: "'Press Start 2P', monospace",
              textShadow: lastResult.hit ? `0 0 10px ${CRT_RED}` : "none",
            }}
          >
            {lastResult.sunk
              ? `SUNK: ${lastResult.shipName?.toUpperCase()}`
              : lastResult.hit
              ? "HIT"
              : "MISS"}
          </div>
        )}
      </div>

      {/* HUD Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "6px 10px",
          border: `1px solid ${CRT_GREEN_DARK}`,
          background: `${CRT_GREEN}05`,
          marginBottom: 10,
          fontSize: 9,
          color: CRT_GREEN_DIM,
          fontFamily: "'Silkscreen', monospace",
        }}
      >
        <span>DEPTH: D{depth + 1}</span>
        <span>VIEW: {viewMode.toUpperCase()}</span>
        <span>BOARD: {boardView.toUpperCase()}</span>
        <span>TURN: {turnCount}</span>
      </div>

      {/* Enemy fleet status */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: CRT_GREEN_DIM,
            fontFamily: "'Silkscreen', monospace",
            alignSelf: "center",
            marginRight: 4,
          }}
        >
          ENEMY:
        </span>
        {SHIPS.map((s) => {
          const hp = shipHealth[opponentIdx][s.id];
          const sunk = hp <= 0;
          return (
            <div
              key={s.id}
              style={{
                padding: "3px 8px",
                border: `1px solid ${sunk ? CRT_ORANGE : CRT_GREEN_DARK}`,
                color: sunk ? CRT_ORANGE : CRT_GREEN_DIM,
                fontSize: 8,
                fontFamily: "'Silkscreen', monospace",
                textDecoration: sunk ? "line-through" : "none",
              }}
            >
              {s.name.toUpperCase()} {sunk ? "SUNK" : `[${hp}/${s.size}]`}
            </div>
          );
        })}
      </div>

      {/* Abilities */}
      <div style={{ marginBottom: 10 }}>
        <div
          style={{
            fontSize: 9,
            color: CRT_GREEN_DIM,
            fontFamily: "'Silkscreen', monospace",
            marginBottom: 6,
          }}
        >
          ABILITIES
        </div>
        <AbilityTray abilities={abilities[currentPlayer]} onUse={onUseAbility} />
      </div>

      {/* Game Log (last 4) */}
      <div
        style={{
          border: `1px solid ${CRT_GREEN_DARK}`,
          padding: 8,
          maxHeight: 72,
          overflow: "hidden",
          marginBottom: 10,
        }}
      >
        {gameLog.slice(-4).map((entry, i) => (
          <div
            key={i}
            style={{
              fontSize: 8,
              color: entry.includes("HIT") || entry.includes("SUNK")
                ? CRT_RED
                : entry.includes("ABILITY")
                ? CRT_YELLOW
                : CRT_GREEN_DIM,
              fontFamily: "'Silkscreen', monospace",
              padding: "1px 0",
            }}
          >
            {entry}
          </div>
        ))}
      </div>

      {/* End turn */}
      <div style={{ textAlign: "center" }}>
        <button
          onClick={() => {
            setLastResult(null);
            onEndTurn();
          }}
          style={{
            background: "transparent",
            border: `2px solid ${CRT_GREEN}`,
            color: CRT_GREEN,
            padding: "10px 28px",
            fontSize: 12,
            fontFamily: "'Press Start 2P', monospace",
            cursor: "pointer",
            textShadow: `0 0 10px ${CRT_GREEN}`,
            letterSpacing: 2,
          }}
        >
          END TURN
        </button>
      </div>
    </div>
  );
}

// ─── VICTORY SCREEN ───
function VictoryScreen({ winner, turnCount, onRestart }) {
  const [blink, setBlink] = useState(true);
  useEffect(() => {
    const id = setInterval(() => setBlink((b) => !b), 500);
    return () => clearInterval(id);
  }, []);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: CRT_GREEN_DIM,
          fontFamily: "'Silkscreen', monospace",
          letterSpacing: 4,
          marginBottom: 24,
        }}
      >
        ◆ ENGAGEMENT COMPLETE ◆
      </div>
      <div
        style={{
          fontSize: 42,
          fontFamily: "'Press Start 2P', monospace",
          color: CRT_GREEN,
          textShadow: `0 0 30px ${CRT_GREEN}, 0 0 60px ${CRT_GREEN}66`,
          marginBottom: 12,
        }}
      >
        {winner === 0 ? "ALPHA" : "BRAVO"}
      </div>
      <div
        style={{
          fontSize: 18,
          fontFamily: "'Press Start 2P', monospace",
          color: CRT_GREEN,
          marginBottom: 32,
        }}
      >
        VICTORIOUS
      </div>
      <div
        style={{
          fontSize: 10,
          color: CRT_GREEN_DIM,
          fontFamily: "'Silkscreen', monospace",
          marginBottom: 48,
        }}
      >
        ENGAGEMENT RESOLVED IN {turnCount} TURNS
      </div>
      <button
        onClick={onRestart}
        style={{
          background: "transparent",
          border: `2px solid ${CRT_GREEN}`,
          color: CRT_GREEN,
          padding: "12px 36px",
          fontSize: 14,
          fontFamily: "'Press Start 2P', monospace",
          cursor: "pointer",
          textShadow: `0 0 10px ${CRT_GREEN}`,
          opacity: blink ? 1 : 0.6,
          letterSpacing: 3,
        }}
      >
        NEW ENGAGEMENT
      </button>
    </div>
  );
}

// ─── MAIN GAME CONTROLLER ───
export default function ContactGame() {
  // Game phases: title, setup_handoff_0, setup_0, setup_handoff_1, setup_1, combat_handoff, combat, victory
  const [phase, setPhase] = useState("title");
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [turnCount, setTurnCount] = useState(1);
  const [gameLog, setGameLog] = useState([]);
  const [winner, setWinner] = useState(null);

  // Player grids: { own: 8x8x8, targeting: 8x8x8 }
  const [playerGrids, setPlayerGrids] = useState([
    { own: emptyGrid(), targeting: emptyGrid() },
    { own: emptyGrid(), targeting: emptyGrid() },
  ]);

  // Ship health
  const [shipHealth, setShipHealth] = useState([
    { typhoon: 5, akula: 4, seawolf: 3, virginia: 3, midget: 2 },
    { typhoon: 5, akula: 4, seawolf: 3, virginia: 3, midget: 2 },
  ]);

  // Abilities
  const initAbilities = () => [
    { id: "sonar", name: "SONAR PING", type: "offensive", available: false, used: false, earned: "first_hit" },
    { id: "jammer", name: "RADAR JAM", type: "defensive", available: false, used: false, earned: "first_hit_recv" },
    { id: "drone", name: "RECON DRONE", type: "offensive", available: false, used: false, earned: "first_sink" },
    { id: "depth_charge", name: "DEPTH CHRG", type: "offensive", available: false, used: false, earned: "second_sink" },
    { id: "silent", name: "SILENT RUN", type: "defensive", available: false, used: false, earned: "first_ship_lost" },
    { id: "gsonar", name: "G-SONAR", type: "offensive", available: false, used: false, earned: "third_sink" },
    { id: "cloak", name: "ACOU CLOAK", type: "defensive", available: false, used: false, earned: "enemy_gsonar" },
  ];
  const [abilities, setAbilities] = useState([initAbilities(), initAbilities()]);

  // Stats for ability unlock tracking
  const [stats, setStats] = useState([
    { hitsScored: 0, hitsReceived: 0, shipsSunk: 0, shipsLost: 0 },
    { hitsScored: 0, hitsReceived: 0, shipsSunk: 0, shipsLost: 0 },
  ]);

  const addLog = (msg) => setGameLog((l) => [...l, `[T${turnCount}] ${msg}`]);

  // Update ability availability based on stats
  const updateAbilities = (newStats, abils) => {
    const updated = [JSON.parse(JSON.stringify(abils[0])), JSON.parse(JSON.stringify(abils[1]))];
    for (let p = 0; p < 2; p++) {
      const s = newStats[p];
      updated[p].forEach((ab) => {
        if (ab.used) return;
        if (ab.earned === "first_hit" && s.hitsScored >= 1) ab.available = true;
        if (ab.earned === "first_hit_recv" && s.hitsReceived >= 1) ab.available = true;
        if (ab.earned === "first_sink" && s.shipsSunk >= 1) ab.available = true;
        if (ab.earned === "second_sink" && s.shipsSunk >= 2) ab.available = true;
        if (ab.earned === "first_ship_lost" && s.shipsLost >= 1) ab.available = true;
        if (ab.earned === "third_sink" && s.shipsSunk >= 3) ab.available = true;
      });
    }
    return updated;
  };

  const handleFire = (x, y, z) => {
    const opponent = currentPlayer === 0 ? 1 : 0;
    const oppCell = playerGrids[opponent].own[z][y][x];
    const isHit = oppCell.state === "ship";
    const isDecoy = oppCell.state === "decoy";

    const newGrids = JSON.parse(JSON.stringify(playerGrids));
    const newHealth = JSON.parse(JSON.stringify(shipHealth));
    const newStats = JSON.parse(JSON.stringify(stats));

    let result = { hit: false, sunk: false, shipName: null };

    if (isHit) {
      newGrids[currentPlayer].targeting[z][y][x] = { state: "hit", shipId: oppCell.shipId };
      newGrids[opponent].own[z][y][x] = { state: "hit", shipId: oppCell.shipId };
      newHealth[opponent][oppCell.shipId] -= 1;
      newStats[currentPlayer].hitsScored += 1;
      newStats[opponent].hitsReceived += 1;
      result.hit = true;

      const shipName = SHIPS.find((s) => s.id === oppCell.shipId)?.name || oppCell.shipId;

      if (newHealth[opponent][oppCell.shipId] <= 0) {
        // Mark all cells as sunk
        for (let dz = 0; dz < GRID; dz++)
          for (let dy = 0; dy < GRID; dy++)
            for (let dx = 0; dx < GRID; dx++) {
              if (newGrids[opponent].own[dz][dy][dx].shipId === oppCell.shipId) {
                newGrids[opponent].own[dz][dy][dx].state = "sunk";
                newGrids[currentPlayer].targeting[dz][dy][dx] = { state: "sunk", shipId: oppCell.shipId };
              }
            }
        newStats[currentPlayer].shipsSunk += 1;
        newStats[opponent].shipsLost += 1;
        result.sunk = true;
        result.shipName = shipName;
        addLog(`${currentPlayer === 0 ? "ALPHA" : "BRAVO"} SUNK ${shipName.toUpperCase()} at ${coordStr(x, y, z)}`);
      } else {
        addLog(`${currentPlayer === 0 ? "ALPHA" : "BRAVO"} HIT at ${coordStr(x, y, z)}`);
      }

      // Check win
      const allSunk = Object.values(newHealth[opponent]).every((h) => h <= 0);
      if (allSunk) {
        setPlayerGrids(newGrids);
        setShipHealth(newHealth);
        setStats(newStats);
        setWinner(currentPlayer);
        setPhase("victory");
        return result;
      }
    } else if (isDecoy) {
      newGrids[currentPlayer].targeting[z][y][x] = { state: "decoy_hit", shipId: "decoy" };
      result.hit = true;
      addLog(`${currentPlayer === 0 ? "ALPHA" : "BRAVO"} HIT DECOY at ${coordStr(x, y, z)}`);
    } else {
      newGrids[currentPlayer].targeting[z][y][x] = { state: "miss", shipId: null };
      addLog(`${currentPlayer === 0 ? "ALPHA" : "BRAVO"} MISS at ${coordStr(x, y, z)}`);
    }

    setPlayerGrids(newGrids);
    setShipHealth(newHealth);
    setStats(newStats);
    setAbilities(updateAbilities(newStats, abilities));
    return result;
  };

  const handleAbility = (abilityId) => {
    const newAbils = JSON.parse(JSON.stringify(abilities));
    const ab = newAbils[currentPlayer].find((a) => a.id === abilityId);
    if (ab) {
      ab.used = true;
      addLog(`ABILITY: ${currentPlayer === 0 ? "ALPHA" : "BRAVO"} deployed ${ab.name}`);
    }
    setAbilities(newAbils);
  };

  const handleEndTurn = () => {
    const next = currentPlayer === 0 ? 1 : 0;
    setCurrentPlayer(next);
    if (next === 0) setTurnCount((t) => t + 1);
    setPhase("combat_handoff");
  };

  const handleSetupComplete = (grid, player) => {
    const newGrids = JSON.parse(JSON.stringify(playerGrids));
    newGrids[player].own = grid;
    setPlayerGrids(newGrids);
    if (player === 0) {
      setPhase("setup_handoff_1");
    } else {
      setCurrentPlayer(0);
      setPhase("combat_handoff");
    }
  };

  const restart = () => {
    setPhase("title");
    setCurrentPlayer(0);
    setTurnCount(1);
    setGameLog([]);
    setWinner(null);
    setPlayerGrids([
      { own: emptyGrid(), targeting: emptyGrid() },
      { own: emptyGrid(), targeting: emptyGrid() },
    ]);
    setShipHealth([
      { typhoon: 5, akula: 4, seawolf: 3, virginia: 3, midget: 2 },
      { typhoon: 5, akula: 4, seawolf: 3, virginia: 3, midget: 2 },
    ]);
    setAbilities([initAbilities(), initAbilities()]);
    setStats([
      { hitsScored: 0, hitsReceived: 0, shipsSunk: 0, shipsLost: 0 },
      { hitsScored: 0, hitsReceived: 0, shipsSunk: 0, shipsLost: 0 },
    ]);
  };

  return (
    <div
      style={{
        background: CRT_BG,
        minHeight: "100vh",
        color: CRT_GREEN,
        fontFamily: "'Silkscreen', monospace",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Silkscreen&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${CRT_BG}; overflow-x: hidden; }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        button:hover { filter: brightness(1.2); }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${CRT_BG}; }
        ::-webkit-scrollbar-thumb { background: ${CRT_GREEN_DARK}; }
      `}</style>
      <Scanlines />
      <CRTVignette />

      {phase === "title" && (
        <TitleScreen onStart={() => setPhase("setup_handoff_0")} />
      )}

      {phase === "setup_handoff_0" && (
        <HandoffScreen player={0} onReady={() => setPhase("setup_0")} />
      )}

      {phase === "setup_0" && (
        <SetupScreen player={0} onComplete={(g) => handleSetupComplete(g, 0)} />
      )}

      {phase === "setup_handoff_1" && (
        <HandoffScreen player={1} onReady={() => setPhase("setup_1")} />
      )}

      {phase === "setup_1" && (
        <SetupScreen player={1} onComplete={(g) => handleSetupComplete(g, 1)} />
      )}

      {phase === "combat_handoff" && (
        <HandoffScreen player={currentPlayer} onReady={() => setPhase("combat")} />
      )}

      {phase === "combat" && (
        <CombatScreen
          playerGrids={playerGrids}
          currentPlayer={currentPlayer}
          onFire={handleFire}
          onEndTurn={handleEndTurn}
          turnCount={turnCount}
          shipHealth={shipHealth}
          abilities={abilities}
          onUseAbility={handleAbility}
          gameLog={gameLog}
        />
      )}

      {phase === "victory" && (
        <VictoryScreen winner={winner} turnCount={turnCount} onRestart={restart} />
      )}
    </div>
  );
}
