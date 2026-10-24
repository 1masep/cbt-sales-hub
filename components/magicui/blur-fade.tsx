"use client";

// Adapted from Magic UI's Blur Fade (magicui.design/docs/components/blur-fade).
// DESIGN.md defaults: direction up, ~0.2s, small offset; renders children
// directly under reduced motion.
import { motion, useReducedMotion } from "motion/react";

type Props = { children: React.ReactNode; delay?: number; duration?: number; offset?: number; className?: string };

export function BlurFade({ children, delay = 0, duration = 0.2, offset = 4, className }: Props) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ y: offset, opacity: 0, filter: "blur(4px)" }}
      animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
      transition={{ delay: Math.min(delay, 0.4), duration, ease: [0.25, 1, 0.5, 1] }}
    >
      {children}
    </motion.div>
  );
}
