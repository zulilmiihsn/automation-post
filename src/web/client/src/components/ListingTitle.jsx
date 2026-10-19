import { useEffect, useRef, useState } from 'react';

export default function ListingTitle({ text = '' }) {
  const wrapRef = useRef(null);
  const textRef = useRef(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      const el = textRef.current;
      if (!wrap || !el) return;
      const overflow = el.scrollWidth - wrap.clientWidth;
      setShift(overflow > 8 ? overflow : 0);
    };
    measure();
    const t = setTimeout(measure, 600);
    window.addEventListener('resize', measure);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
    };
  }, [text]);

  return (
    <div ref={wrapRef} className="listing-title-marquee" title={text}>
      <span
        ref={textRef}
        className={shift > 0 ? 'listing-title-text is-overflow' : 'listing-title-text'}
        style={shift > 0 ? { '--shift': `${shift}px` } : undefined}
      >
        {text || 'Produk Tanpa Judul'}
      </span>
    </div>
  );
}
