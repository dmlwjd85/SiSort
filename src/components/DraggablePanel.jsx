import React, { useState, useCallback, useRef } from 'react';

/**
 * 자식을 드래그해 옮길 수 있는 래퍼(팝업이 진행 화면을 가릴 때 위치 조정)
 * @param {{ children: React.ReactNode, className?: string, handleClassName?: string, initial?: { dx: number, dy: number } }} props
 */
export default function DraggablePanel({
  children,
  className = '',
  handleClassName = 'cursor-grab active:cursor-grabbing touch-none select-none',
  initial = { dx: 0, dy: 0 },
}) {
  const [{ dx, dy }, setOff] = useState(initial);
  const drag = useRef(null);

  const onPointerDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      drag.current = { sx: e.clientX, sy: e.clientY, dx, dy };
      const move = (ev) => {
        if (!drag.current) return;
        setOff({
          dx: drag.current.dx + (ev.clientX - drag.current.sx),
          dy: drag.current.dy + (ev.clientY - drag.current.sy),
        });
      };
      const up = () => {
        drag.current = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    },
    [dx, dy]
  );

  return (
    <div
      className={className}
      style={{ transform: `translate(${dx}px, ${dy}px)` }}
    >
      <div
        className={`flex items-center justify-center gap-1 rounded-t-lg bg-slate-700/90 px-2 py-1 text-[10px] text-slate-400 ${handleClassName}`}
        onPointerDown={onPointerDown}
        title="드래그해 위치를 옮길 수 있습니다"
      >
        <span aria-hidden>⠿</span>
        <span>이동</span>
      </div>
      {children}
    </div>
  );
}
