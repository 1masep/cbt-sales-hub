"use client";

// Adapted from Magic UI's Number Ticker (magicui.design/docs/components/number-ticker).
// Changes per DESIGN.md: shows the formatted value from the start (never animates
// on first render), moves from the previous value to the new one when it changes,
// renders the final value directly under reduced motion, and exposes the exact
// final value to screen readers.
import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef } from "react";

type Props = { value: number; decimalPlaces?: number; prefix?: string; className?: string };

function format(n: number, decimalPlaces: number, prefix: string) {
  return (
    prefix +
    Intl.NumberFormat("en-US", { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces }).format(
      Number(n.toFixed(decimalPlaces)),
    )
  );
}

export function NumberTicker({ value, decimalPlaces = 0, prefix = "", className }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(value);
  // Near-critically damped so the exact figure lands in well under a second
  // (Magic UI's damping 60 / stiffness 100 took 5-6 s to settle to the cent).
  const spring = useSpring(motionValue, { stiffness: 170, damping: 26, restDelta: 0.001 });
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!reduce && inView) motionValue.set(value);
  }, [value, inView, reduce, motionValue]);

  useEffect(
    () =>
      spring.on("change", (latest) => {
        if (ref.current) ref.current.textContent = format(latest, decimalPlaces, prefix);
      }),
    [spring, decimalPlaces, prefix],
  );

  const final = format(value, decimalPlaces, prefix);
  if (reduce) return <span className={className}>{final}</span>;
  return (
    <span className={className} aria-label={final}>
      <span ref={ref} aria-hidden>
        {format(motionValue.get(), decimalPlaces, prefix)}
      </span>
    </span>
  );
}
