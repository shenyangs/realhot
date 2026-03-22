"use client";

import { useEffect, useState } from "react";

export function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(window.scrollY > 320);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <button
      aria-label="回到顶部"
      className={`hotspotBackToTop ${visible ? "hotspotBackToTopVisible" : ""}`}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      title="回到顶部"
      type="button"
    >
      ↑
    </button>
  );
}
