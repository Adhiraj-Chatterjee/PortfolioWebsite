import { Canvas, useFrame, createPortal, useThree } from "@react-three/fiber";
import { useFBO } from "@react-three/drei";
import React, { useEffect, useRef, useMemo, useState } from "react";
import * as THREE from "three";
import { gsap } from "gsap";
import TableScene from "./TableScene";
import Hero3D from "./Hero3D";
import { useControls } from "leva";

// --- SHADER DEFINITION ---
const TransitionShader = {
  uniforms: {
    tTable: { value: null },
    tHero: { value: null },
    uProgress: { value: 0 },
    uTableExposure: { value: 3.06 },
    uHeroExposure: { value: 1.87 },
    uSoftness: { value: 0.1 },
    uResolution: { value: new THREE.Vector2() }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tTable;
    uniform sampler2D tHero;
    uniform float uProgress;
    uniform float uTableExposure;
    uniform float uHeroExposure;
    uniform float uSoftness;
    varying vec2 vUv;

    void main() {
      // Diagonal wipe logic: Bottom-Right to Top-Left
      float strength = vUv.x - vUv.y;
      float threshold = mix(1.5, -1.5, uProgress);
      
      vec4 tex1 = texture2D(tTable, vUv);
      vec4 tex2 = texture2D(tHero, vUv);
      
      // Apply per-scene exposure multipliers
      tex1.rgb *= uTableExposure;
      tex2.rgb *= uHeroExposure;
      
      // Smoothstep for a soft-feathered edge
      float mask = smoothstep(threshold - uSoftness, threshold + uSoftness, strength);
      
      gl_FragColor = mix(tex1, tex2, mask);
    }
  `
};

/**
 * TransitionRenderer: Captures two scenes and blends them via shader
 */
const TransitionRenderer = ({ progress, projectIndex }) => {
  const { camera, size } = useThree();

  // 1. Two FBOs for the two scenes with proper color space
  const fboTable = useFBO({
    samples: 8,
    colorSpace: THREE.SRGBColorSpace,
  });
  const fboHero = useFBO({
    samples: 8,
    colorSpace: THREE.SRGBColorSpace,
  });

  // 2. Separate virtual worlds
  const sceneTable = useMemo(() => new THREE.Scene(), []);
  const sceneHero = useMemo(() => new THREE.Scene(), []);

  // 3. Isolated cameras
  const camTableBase = useMemo(() => new THREE.Vector3(-1.14, 2.5, 3.5), []);

  const camTable = useMemo(() => {
    const c = new THREE.PerspectiveCamera(30, size.width / size.height, 0.1, 1000);
    c.position.copy(camTableBase);
    return c;
  }, [camTableBase, size.width, size.height]);

  useEffect(() => {
    gsap.to(camTableBase, {
      x: -1.14,
      y: -0.61,
      z: 1.75, // Target resting depth
      duration: 2.5,
      ease: "power3.inOut",
      delay: 1.5 // Wait for loader
    });
  }, [camTableBase]);

  const camHero = useMemo(() => {
    const c = new THREE.PerspectiveCamera(30, size.width / size.height, 0.1, 1000);
    c.position.set(0, 0, 5.3);
    return c;
  }, []);

  // 4. Shader Material
  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      ...TransitionShader,
      transparent: true // allow FBO alphas to penetrate
    });
    mat.toneMapped = true;
    return mat;
  }, []);

  useEffect(() => {
    const aspect = size.width / size.height;
    camTable.aspect = aspect;
    camTable.updateProjectionMatrix();
    camHero.aspect = aspect;
    camHero.updateProjectionMatrix();
  }, [size, camTable, camHero]);

  // Keep display camera at origin
  useEffect(() => {
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
  }, [camera]);

  const { tableExposure, heroExposure, softness } = useControls("Scene Exposure", {
    tableExposure: { value: 3.06, min: 0, max: 5, step: 0.01 },
    heroExposure: { value: 1.87, min: 0, max: 5, step: 0.01 },
    softness: { value: 0.1, min: 0, max: 0.5, step: 0.01 },
  });

  const tableTarget = useMemo(() => new THREE.Vector3(-0.87, -0.86, 0.65), []);

  useFrame((state, delta) => {
    material.uniforms.uProgress.value = progress.value;
    material.uniforms.uTableExposure.value = tableExposure;
    material.uniforms.uHeroExposure.value = heroExposure;
    material.uniforms.uSoftness.value = softness;

    // --- SCENE 1 PARALLAX (Buttery Smooth) ---
    // Frame-rate independent lerp: 1 - Math.exp(-speed * delta)
    const smoothFactor = 1 - Math.exp(-8.0 * delta); 

    const pX = state.pointer.x * 0.15;
    const pY = state.pointer.y * 0.15;
    
    camTable.position.x = THREE.MathUtils.lerp(camTable.position.x, camTableBase.x + pX, smoothFactor);
    camTable.position.y = THREE.MathUtils.lerp(camTable.position.y, camTableBase.y + pY, smoothFactor);
    camTable.position.z = THREE.MathUtils.lerp(camTable.position.z, camTableBase.z, smoothFactor);
    
    // Smoothly point the camera at its target (Synchronized)
    camTable.lookAt(tableTarget);

    // --- SCENE 2 PARALLAX (Subtle) ---
    camHero.position.x = THREE.MathUtils.lerp(camHero.position.x, 0 + pX * 0.5, smoothFactor);
    camHero.position.y = THREE.MathUtils.lerp(camHero.position.y, 0 + pY * 0.5, smoothFactor);
    camHero.lookAt(0, 0, 0);

    // --- RENDER PASSES ---
    state.gl.setRenderTarget(fboTable);
    state.gl.render(sceneTable, camTable);

    state.gl.setRenderTarget(fboHero);
    state.gl.render(sceneHero, camHero);

    state.gl.setRenderTarget(null);

    // Update uniforms
    material.uniforms.tTable.value = fboTable.texture;
    material.uniforms.tHero.value = fboHero.texture;
  });

  const f = 2 * Math.tan((camera.fov * Math.PI) / 360);
  const width = f * camera.aspect;
  const height = f;

  return (
    <>
      {createPortal(<TableScene />, sceneTable, { camera: camTable })}
      {/* Ferris Wheel removed per user request */}
      {/* {createPortal(<Hero3D projectIndex={projectIndex} />, sceneHero, { camera: camHero })} */}

      <mesh position={[0, 0, -1]} scale={[width, height, 1]}>
        <planeGeometry />
        <primitive object={material} attach="material" />
      </mesh>
    </>
  );
};

const Experience = () => {
  const headingRef = useRef();
  const descriptionRef = useRef();
  const introPanelRef = useRef();
  const navPanelRef = useRef();
  const scrollCooldown = useRef(false);
  const descStripRef = useRef();   // Top description strip
  const mediaStripRef = useRef();  // Bottom media strip
  const corridorRef = useRef();    // Right software strip

  const [isSkills, setIsSkills] = useState(false);
  const [projectIndex, setProjectIndex] = useState(0);

  const categories = [
    "Design & 3D",
    "Coding & Profiles",
    "Interactive & Game Dev",
    "Automation & Tools"
  ];

  // Mapping of software keys to icon paths
  const softwareIconMap = {
    "Blender": "/assets/icons/Blender_logo_no_text.svg",
    "Photoshop": "/assets/icons/Adobe_Photoshop_CC_icon.svg",
    "PremierePro": "/assets/icons/Adobe_Premiere_Pro_CC_icon.svg",
    "AfterEffects": "/assets/icons/Adobe_After_Effects_CC_icon.svg",
    "UnrealEngine": "/assets/icons/unreal.svg",
    "LeetCode": "/assets/coding_profiles/LeetCode_logo_black.png",
    "Codeforces": "/assets/coding_profiles/Codeforces_logo.svg.png",
    "LinkedIn": "/assets/coding_profiles/LinkedIn_logo_initials.png",
    "Monkeytype": "/assets/coding_profiles/Monkeytype_logo.png"
  };

  // 13 assets with software metadata
  const designProjects = [
    { title: "Dream Sequence", file: "/assets/Design&3D/DreamSequence.mp4", software: ["Blender", "PremierePro"], desc: "A narrative cutscene animation. Placeholder description goes here." },
    { title: "Path Finder", file: "/assets/Design&3D/PathFinder.jpg", software: ["Blender", "Photoshop"], desc: "A sci-fi mechanical concept render. Placeholder description goes here." },
    { title: "Extroyer", file: "/assets/Design&3D/Extroyer.png", software: ["Blender", "Photoshop"], desc: "A stylized character concept. Placeholder description goes here." },
    { title: "Sahotsava Logo Reveal", file: "/assets/Design&3D/logorevealForSahotsava.mp4", software: ["Blender", "PremierePro"], desc: "An epic 3D logo animation. Placeholder description goes here." },
    { title: "Playcon Advertisement", file: "/assets/Design&3D/220624-PlayconAdvertisement.mp4", software: ["Blender", "PremierePro", "AfterEffects"], desc: "Commercial spot for Playcon. Placeholder description goes here." },
    { title: "Final Car Render", file: "/assets/Design&3D/Final Car Render.mp4", software: ["Blender", "PremierePro"], desc: "High-fidelity automotive render. Placeholder description goes here." },
    { title: "Transformer Head", file: "/assets/Design&3D/TransformerHead.mp4", software: ["Blender"], desc: "Complex hard-surface modeling. Placeholder description goes here." },
    { title: "Godrej Classroom Edit", file: "/assets/Design&3D/GodrejClassroomEdit.mp4", software: ["Blender", "PremierePro"], desc: "Architectural visualization snippet. Placeholder description goes here." },
    { title: "Suited Monster", file: "/assets/Design&3D/SuitedMonster.png", software: ["Blender"], desc: "Character modeling and posing. Placeholder description goes here." },
    { title: "R.S Entreprize Poster", file: "/assets/Design&3D/R.S Entreprize new year poster.png", software: ["Photoshop"], desc: "Graphic design marketing material. Placeholder description goes here." },
    { title: "Saraswati Poster", file: "/assets/Design&3D/SaraswatiPoster.png", software: ["Photoshop"], desc: "Cultural event graphic design. Placeholder description goes here." },
    { title: "Dance Battle Cypher", file: "/assets/Design&3D/DanceBattleCypher2.png", software: ["Photoshop"], desc: "High-energy event poster design. Placeholder description goes here." },
    { title: "Echostorm", file: "/assets/Design&3D/Echostorm3.png", software: ["Blender", "Photoshop"], desc: "Futuristic visual concept art. Placeholder description goes here." }
  ];

  const codingProjects = [
    { 
      title: "LeetCode", 
      file: "/assets/coding_profiles/Leetcode.png", 
      url: "https://leetcode.com/u/Barry_Code/", 
      software: ["LeetCode"],
      desc: "Competitive programming and algorithm practice profile." 
    },
    { 
      title: "Codeforces", 
      file: "/assets/coding_profiles/CodeForces.png", 
      url: "https://codeforces.com/profile/AdhirajChatterjee", 
      software: ["Codeforces"],
      desc: "Competitive coding profile on Codeforces." 
    },
    { 
      title: "LinkedIn", 
      file: "/assets/coding_profiles/LinkedIn.png", 
      url: "https://www.linkedin.com/in/adhiraj-chatterjee-360686381/", 
      software: ["LinkedIn"],
      desc: "Professional networking and industry connections." 
    },
    { 
      title: "Monkeytype", 
      file: "/assets/coding_profiles/Monkeytype.png", 
      url: "https://monkeytype.com/profile/BarryCode", 
      software: ["Monkeytype"],
      desc: "Typing speed and accuracy practice profile." 
    }
  ];

  const fullProjectList = [...designProjects, ...codingProjects];
  
  // Derived state: activeCategory is based on the projectIndex
  const activeCategory = projectIndex < designProjects.length ? 0 : 1;

  // Shared animation progress object for GSAP
  const transitionProgress = useMemo(() => ({ value: 0 }), []);

  useEffect(() => {
    // Animate the uProgress value when isSkills toggles
    gsap.to(transitionProgress, {
      value: isSkills ? 1 : 0,
      duration: 1.5,
      ease: "power2.inOut"
    });

    if (isSkills) {
      gsap.to(introPanelRef.current, { x: "150%", opacity: 0, duration: 1.2, ease: "power3.inOut" });
      gsap.fromTo(navPanelRef.current, 
        { x: "-150%", opacity: 0, display: "none" }, 
        { x: "0%", opacity: 1, display: "flex", duration: 1.2, ease: "power3.out", delay: 0.6 }
      );
      // Entrance animations for the three strips
      gsap.fromTo(descStripRef.current,
        { y: "-100vh", opacity: 0 },
        { y: "0px", opacity: 1, duration: 1.0, ease: "power3.out", delay: 0.4 }
      );
      gsap.fromTo(mediaStripRef.current,
        { y: "100vh", opacity: 0 },
        { y: "0px", opacity: 1, duration: 1.0, ease: "power3.out", delay: 0.4 }
      );
      gsap.fromTo(corridorRef.current,
        { x: "100%", opacity: 0 },
        { x: "0%", opacity: 1, duration: 1.0, ease: "power3.out", delay: 0.5 }
      );
    } else {
      gsap.to(introPanelRef.current, { x: "0%", opacity: 1, duration: 1.2, ease: "power3.out", delay: 0.6 });
      gsap.to(navPanelRef.current, { x: "-150%", opacity: 0, duration: 1.2, ease: "power3.inOut", onComplete: () => {
         if (navPanelRef.current) navPanelRef.current.style.display = 'none';
      }});
      // Exit animations for the three strips
      gsap.to(descStripRef.current, { y: "-100vh", opacity: 0, duration: 0.8, ease: "power3.inOut" });
      gsap.to(mediaStripRef.current, { y: "100vh", opacity: 0, duration: 0.8, ease: "power3.inOut" });
      gsap.to(corridorRef.current, { x: "100%", opacity: 0, duration: 0.8, ease: "power3.inOut" });
    }
  }, [isSkills, transitionProgress]);

  // Synchronize a UI scroll event safely (matches Hero3D 500ms cooldown)
  useEffect(() => {
    if (!isSkills) return;

    const handleWheel = (e) => {
      if (scrollCooldown.current) return;
      
      if (e.deltaY > 0) {
        setProjectIndex((prev) => Math.min(prev + 1, fullProjectList.length - 1));
      } else if (e.deltaY < 0) {
        setProjectIndex((prev) => Math.max(prev - 1, 0));
      }
      
      scrollCooldown.current = true;
      setTimeout(() => {
        scrollCooldown.current = false;
      }, 500);
    };

    window.addEventListener("wheel", handleWheel);
    return () => window.removeEventListener("wheel", handleWheel);
  }, [isSkills, fullProjectList.length]);

  useEffect(() => {
    const tl = gsap.timeline({ defaults: { ease: "power4.out", duration: 1.5 } });
    tl.fromTo(headingRef.current,
      { opacity: 0, y: 30, filter: "blur(10px)" },
      { opacity: 1, y: 0, filter: "blur(0px)", delay: 0.5 }
    )
      .fromTo(descriptionRef.current,
        { opacity: 0, y: 20 },
        { opacity: 0.7, y: 0 },
        "-=1.2"
      );
  }, []);

  const glassStyle = {
    color: "white",
    padding: "clamp(20px, 4vw, 40px)",
    borderRadius: "24px",
    background: "linear-gradient(135deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.05)",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
    position: "absolute",
    pointerEvents: "auto"
  };

  const buttonStyle = {
    padding: "16px 32px",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "12px",
    background: "rgba(255, 255, 255, 0.05)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "white",
    cursor: "pointer",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    fontFamily: "'Inter', sans-serif",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)"
  };

  const btnHoverIn = (e) => {
    e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
    e.currentTarget.style.transform = "translateY(-2px)";
    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.2)";
  };

  const btnHoverOut = (e) => {
    e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
    e.currentTarget.style.transform = "translateY(0px)";
    e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
  };

  return (
    <div style={{ 
      width: "100vw", 
      height: "100vh", 
      position: "fixed", 
      top: 0, 
      left: 0,
      background: "radial-gradient(ellipse at 50% 50%, #2b2b44 0%, #0f0f15 50%, #050505 100%)", // Lighter premium core
      overflow: "hidden"
    }}>

      {/* --- LAYER 1: 3D CANVAS (Behind Strips) --- */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", zIndex: 1 }}>
        <Canvas shadows="soft" dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
          <TransitionRenderer progress={transitionProgress} projectIndex={projectIndex} />
        </Canvas>
      </div>

      {/* --- LAYER 2: PROJECT STRIPS (In Front of 3D) --- */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, width: "100%", height: "100%",
        zIndex: 2, pointerEvents: "none"
      }}>
        {/* Top Strip (Descriptions) — GSAP wrapper slides in from top */}
        <div ref={descStripRef} style={{
          position: "absolute", top: "5%", left: 0, width: "100%",
          opacity: 0,
        }}>
          {/* Inner: handles horizontal scroll only */}
          <div style={{
            position: "absolute", left: "50%",
            transform: `translateX(${projectIndex * 100}vw)`,
            transition: "transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)"
          }}>
            {fullProjectList.map((proj, i) => (
              <div key={`desc-${i}`} style={{
                position: "absolute",
                left: `${-i * 100}vw`,
                width: "50vw",
                transform: "translateX(-50%)",
                textAlign: "center",
                transformStyle: "preserve-3d"
              }}>
                <div style={{ ...glassStyle, position: "relative", padding: "20px 40px", pointerEvents: "none", zIndex: 2 }}>
                  <h2 style={{ fontSize: "2rem", margin: "0 0 10px 0", fontFamily: "'Outfit', sans-serif" }}>{proj.title}</h2>
                  <p style={{ fontSize: "1.1rem", margin: "0 0 15px 0", color: "rgba(255,255,255,0.8)", fontFamily: "'Inter', sans-serif" }}>{proj.desc}</p>
                  
                  {activeCategory === 1 && proj.url && (
                    <a 
                      href={proj.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ 
                        display: "inline-block",
                        padding: "8px 20px",
                        background: "rgba(255,255,255,0.1)",
                        border: "1px solid rgba(255,255,255,0.2)",
                        borderRadius: "20px",
                        color: "white",
                        textDecoration: "none",
                        fontSize: "0.9rem",
                        pointerEvents: "auto",
                        transition: "all 0.3s ease",
                        cursor: "pointer"
                      }}
                      onMouseOver={(e) => e.target.style.background = "rgba(255,255,255,0.2)"}
                      onMouseOut={(e) => e.target.style.background = "rgba(255,255,255,0.1)"}
                    >
                      Visit Profile →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Strip (Media) — GSAP wrapper slides in from bottom */}
        <div ref={mediaStripRef} style={{
          position: "absolute", top: "28%", left: 0, width: "100%", height: "65vh",
          opacity: 0,
        }}>
          {/* Inner: handles horizontal scroll only */}
          <div style={{
            position: "absolute", left: "50%",
            transform: `translateX(-${projectIndex * 100}vw)`,
            transition: "transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)"
          }}>
            {fullProjectList.map((proj, i) => (
              <div key={`media-${i}`} style={{
                position: "absolute",
                left: `${i * 100}vw`,
                width: "80vw",
                height: "65vh",
                transform: "translateX(-50%)",
                display: "flex", justifyContent: "center", alignItems: "center"
              }}>
                {proj.file.endsWith(".mp4") ? (
                  <video src={proj.file} autoPlay loop muted playsInline style={{ maxHeight: "90%", maxWidth: "100%", borderRadius: "12px", boxShadow: "0 25px 50px rgba(0,0,0,0.8)" }} />
                ) : (
                  <img 
                    src={proj.file} 
                    style={{ maxHeight: "90%", maxWidth: "100%", borderRadius: "12px", boxShadow: "0 25px 50px rgba(0,0,0,0.8)", objectFit: "contain" }} 
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- LAYER 3: UI OVERLAYS (Buttons, Navbar) --- */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0, 
        width: "100%", 
        height: "100%",
        display: "flex",
        zIndex: 3,
        alignItems: "center",
        boxSizing: "border-box",
        zIndex: 10,
        pointerEvents: "none",
        overflowX: "hidden" // ensures sliding panels don't create horizontal scrollbars
      }}>
        
        {/* PANEL 1: Intro Panel */}
        <div ref={introPanelRef} style={{ ...glassStyle, right: "clamp(20px, 4vw, 40px)", maxWidth: "90%", width: "auto", textAlign: "right" }}>
          <h1 ref={headingRef} style={{ fontSize: "clamp(2.5rem, 7vw, 5rem)", margin: 0, fontWeight: 800, lineHeight: 0.9, fontFamily: "'Outfit', sans-serif" }}>
            Adhiraj<br />Chatterjee
          </h1>
          <p ref={descriptionRef} style={{ fontSize: "1.1rem", marginTop: "20px", color: "rgba(255,255,255,0.9)", maxWidth: "400px", marginLeft: "auto", fontFamily: "'Inter', sans-serif" }}>
            NIMCET Aspirant | Practicing DSA | AI/ML BCA Student | Game Dev with Unreal Engine | Graphic Designer
          </p>
          <button 
            onClick={() => setIsSkills(true)}
            style={{ ...buttonStyle, marginTop: "30px" }}
            onMouseOver={btnHoverIn}
            onMouseOut={btnHoverOut}
          >
            View My Skills →
          </button>
        </div>

        {/* PANEL 2: Skills Nav Panel */}
        <div ref={navPanelRef} style={{ 
          ...glassStyle, 
          left: "clamp(10px, 2vw, 20px)", 
          padding: "15px", 
          display: "none", 
          flexDirection: "column", 
          gap: "10px", 
          minWidth: "150px", 
          maxWidth: "200px", 
          pointerEvents: "auto" // RESTORE CLICKS
        }}>
          <h2 style={{ fontSize: "1rem", margin: "0 0 5px 0", fontFamily: "'Outfit', sans-serif", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "8px" }}>
            Skill Categories
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {categories.map((cat, catIdx) => (
              <div key={cat} style={{ display: "flex", flexDirection: "column" }}>
                <div 
                  onClick={() => {
                    // Jump projectIndex to the start of this category
                    setProjectIndex(catIdx === 0 ? 0 : designProjects.length);
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    background: activeCategory === catIdx ? "rgba(255,255,255,0.08)" : "transparent",
                    color: activeCategory === catIdx ? "white" : "rgba(255,255,255,0.4)",
                    fontSize: "0.85rem",
                    transition: "all 0.3s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    pointerEvents: "auto",
                    fontFamily: "'Inter', sans-serif"
                  }}
                >
                  <div style={{ 
                    width: "6px", 
                    height: "6px", 
                    borderRadius: "50%", 
                    background: activeCategory === catIdx ? "white" : "transparent",
                    boxShadow: activeCategory === catIdx ? "0 0 10px white" : "none",
                    transition: "all 0.3s ease"
                  }} />
                  {cat}
                </div>

                {/* Sub-hierarchy (Project/Profile Names) */}
                {activeCategory === catIdx && (
                  <div style={{ 
                    marginLeft: "24px", 
                    marginTop: "4px", 
                    marginBottom: "8px",
                    borderLeft: "1px solid rgba(255,255,255,0.1)",
                    paddingLeft: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}>
                    {(catIdx === 0 ? designProjects : catIdx === 1 ? codingProjects : []).map((item, pIdx) => {
                      const globalIdx = catIdx === 0 ? pIdx : designProjects.length + pIdx;
                      return (
                        <div
                          key={`sub-${pIdx}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectIndex(globalIdx);
                          }}
                          style={{
                            fontSize: "0.75rem",
                            color: projectIndex === globalIdx ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)",
                            cursor: "pointer",
                            padding: "2px 4px",
                            transition: "all 0.2s ease",
                            pointerEvents: "auto",
                            fontFamily: "'Inter', sans-serif"
                          }}
                        >
                          {item.title}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button 
            onClick={() => setIsSkills(false)}
            style={{ ...buttonStyle, fontSize: "0.9rem", padding: "10px 20px", marginTop: "20px", alignSelf: "flex-start" }}
            onMouseOver={btnHoverIn}
            onMouseOut={btnHoverOut}
          >
            ← Back to Table
          </button>
        </div>

        {/* PANEL 3: Vertical Software Corridor (Right Side) */}
        <div ref={corridorRef} style={{
          position: "fixed",
          right: "16px", 
          top: "0",
          height: "100%",
          width: "170px", 
          display: (isSkills && (activeCategory === 0 || activeCategory === 1)) ? "block" : "none",
          zIndex: 15,
          pointerEvents: "none",
          overflow: "hidden",
          background: "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(255,255,255,0.05) 15%, rgba(255,255,255,0.05) 85%, rgba(0,0,0,0) 100%)",
          borderLeft: "1px solid rgba(255,255,255,0.15)",
          backdropFilter: "blur(12px)"
        }}>
          {/* Visual Track "Rails" */}
          <div style={{ position: "absolute", left: "10px", top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.1)" }} />
          <div style={{ position: "absolute", right: "10px", top: 0, bottom: 0, width: "1px", background: "rgba(255,255,255,0.1)" }} />

          {/* Moving Strip Container - tape starts so slot 0 is centered (50vh - 40vh = 10vh from top) */}
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            transition: "transform 0.8s cubic-bezier(0.25, 1, 0.5, 1)",
            transform: `translateY(calc(10vh - ${projectIndex * 80}vh))`,
          }}>
            {fullProjectList.map((proj, i) => (
              <div key={`soft-slot-${i}`} style={{
                height: "80vh", 
                width: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                position: "relative",
                opacity: projectIndex === i ? 1 : 0.6,
                scale: projectIndex === i ? "1" : "0.9",
                transition: "all 0.6s ease"
              }}>
                {/* Horizontal Separator (Matching Red Marks) */}
                <div style={{ 
                  position: "absolute", 
                  top: 0, 
                  width: "80%", 
                  height: "1px", 
                  background: "linear-gradient(to right, transparent, rgba(255,255,255,0.4), transparent)" 
                }} />

                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  alignItems: "center"
                }}>
                  {proj.software.map((sw, swIdx) => (
                    <div key={`slot-${i}-${sw}-${swIdx}`} style={{
                      width: "90px",
                      height: "90px",
                      borderRadius: "16px",
                      background: projectIndex === i ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
                      border: projectIndex === i ? "1px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.08)",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      boxShadow: projectIndex === i ? "0 0 30px rgba(255,255,255,0.2)" : "none",
                      transition: "all 0.4s ease",
                      position: "relative",
                      overflow: "hidden",
                      flexShrink: 0,
                    }}>
                      {/* Inner Box Shadow/Glow effect */}
                      {/* {projectIndex === i && (
                        <div style={{ 
                          position: "absolute", inset: 0, 
                          background: "radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, transparent 70%)" 
                        }} />
                      )} */}
                      
                      <img 
                        src={softwareIconMap[sw]} 
                        alt={sw} 
                        style={{ 
                          width: "60px", 
                          height: "60px", 
                          objectFit: "contain",
                          filter:  
                             "drop-shadow(0 0 15px white)" ,
                            //  "opacity(1) brightness(1.2)",
                          transition: "all 0.6s ease"
                        }} 
                      />
                    </div>
                  ))}
                </div>

                {/* Bottom Separator */}
                <div style={{ 
                  position: "absolute", 
                  bottom: 0, 
                  width: "80%", 
                  height: "1px", 
                  background: "linear-gradient(to right, transparent, rgba(255,255,255,0.4), transparent)" 
                }} />
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Experience;
