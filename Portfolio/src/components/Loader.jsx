import React, { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { gsap } from "gsap";

const Loader = () => {
  const { progress, active } = useProgress();
  const containerRef = useRef();
  const progressLineRef = useRef();
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    // Animate the progress bar width
    gsap.to(progressLineRef.current, {
        width: `${progress}%`,
        duration: 0.5,
        ease: "power2.out"
    });
  }, [progress]);

  useEffect(() => {
    // If loading is complete, wait a tiny bit then fade out
    if (!active && progress === 100) {
      const tl = gsap.timeline({
        onComplete: () => setIsFinished(true)
      });

      tl.to(progressLineRef.current, {
        opacity: 0,
        duration: 0.3,
        delay: 0.5
      })
      .to(containerRef.current, {
        opacity: 0,
        duration: 1,
        ease: "power3.inOut"
      });
    }
  }, [active, progress]);

  if (isFinished) return null;

  return (
    <div 
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: "#050505",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        color: "white",
        fontFamily: "'Outfit', sans-serif"
      }}
    >
      <div style={{ position: "relative", width: "300px", height: "1px", background: "rgba(255,255,255,0.1)" }}>
        <div 
          ref={progressLineRef}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "0%",
            height: "100%",
            background: "white",
            boxShadow: "0 0 15px white"
          }}
        />
      </div>
      <p style={{ marginTop: "20px", fontSize: "0.8rem", letterSpacing: "0.4em", opacity: 0.5, textTransform: "uppercase" }}>
        Initializing Scene
      </p>
    </div>
  );
};

export default Loader;
