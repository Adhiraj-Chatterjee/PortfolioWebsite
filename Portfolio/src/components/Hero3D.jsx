import { useGLTF, useTexture, Environment, MeshTransmissionMaterial } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useState, useEffect } from "react";
import * as THREE from "three";

// Sub-component for individual panels 
const SinglePanel = ({ mesh, initialAngle, radius, activeIndex, panelCount, iconTexture }) => {
  const panelRef = useRef();
  const matRef = useRef();
  const smoothedAngle = useRef(initialAngle);
  const isHovered = useRef(false);

  // Colors to lerp between
  const normalColor = new THREE.Color("#cceeff");
  const hoverColor = new THREE.Color("#88ddff");

  // Calculate icon scaling based on native aspect ratio
  const aspect = iconTexture && iconTexture.image ? iconTexture.image.width / iconTexture.image.height : 1;
  // Use a base scale of 1; adjust width/height so it fits inside a 1x1 box without stretching
  const iconWidth = aspect > 1 ? 1 : aspect;
  const iconHeight = aspect > 1 ? 1 / aspect : 1;

  useFrame((state, delta) => {
    if (!panelRef.current || !matRef.current) return;

    // 1. ROTATION LOGIC
    const rotationOffset = (activeIndex / panelCount) * Math.PI * 2;
    const targetAngle = initialAngle - rotationOffset;
    smoothedAngle.current = THREE.MathUtils.lerp(smoothedAngle.current, targetAngle, 0.1);

    // 2. POSITION & ROTATION
    panelRef.current.position.y = Math.sin(smoothedAngle.current) * radius;
    panelRef.current.position.z = Math.cos(smoothedAngle.current) * radius;
    panelRef.current.position.x = 0; // keeps them horizontally centered
    panelRef.current.rotation.x = -smoothedAngle.current; // face the origin/camera properly
    panelRef.current.rotation.y = 0;
    panelRef.current.rotation.z = 0;

    // 3. SCALING LOGIC (Fixed scaling per user request)
    const targetScale = 0.2; 
    panelRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.1);

    // 4. HOVER HIGHLIGHT — smoothly lerp between normal and hover color
    const target = isHovered.current ? hoverColor : normalColor;
    matRef.current.color.lerp(target, 0.1);
  });

  return (
    <group ref={panelRef}>
      <mesh
        geometry={mesh.geometry}
        renderOrder={2}
        onPointerOver={() => {
          isHovered.current = true;
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          isHovered.current = false;
          document.body.style.cursor = "default";
        }}
      >
        <MeshTransmissionMaterial
          ref={matRef}
          samples={8}
          resolution={1024}
          transmission={0.9}      // Lowered to prevent pure black void refraction
          opacity={0.8}           // Allows the bright color to show and mix with the CSS background
          transparent={true}
          thickness={0.5}
          roughness={0.05}        // Reduced for sharper reflections
          clearcoat={1}           // Added to create a high-gloss reflection layer
          clearcoatRoughness={0.1}
          metalness={0.3}         // Higher metalness boosts HDR Environment reflections significantly
          ior={1.6}               // Increased IOR slightly for denser glass
          chromaticAberration={0.05}
          anisotropy={0.5}
          distortion={0.5}        // Reduced distortion for cleaner face reflection
          distortionScale={1.5}
          temporalDistortion={0.0}
          color="#cceeff"
          backside={false}
          toneMapped={false}
        />
      </mesh>

      {/* Icon Placed on the Glass */}
      {iconTexture && (
        <mesh position={[0, 0, 0.16]} renderOrder={3}>
          <planeGeometry args={[iconWidth, iconHeight]} />
          <meshBasicMaterial map={iconTexture} transparent={true} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
};

const Hero3D = ({ projectIndex = 0 }) => {
  const photoRef = useRef();

  // Load Assets
  const { nodes } = useGLTF("/assets/Display panel.glb");

  // Load Icons
  const icons = useTexture([
    "/assets/icons/Adobe_Photoshop_CC_icon.svg", // 0: Photoshop
    "/assets/icons/Blender_logo_no_text.svg",    // 1: Blender
    "/assets/icons/unreal.svg",                  // 2: UnrealEngine
    "/assets/icons/Adobe_After_Effects_CC_icon.svg", // 3: AfterEffects
    "/assets/icons/Adobe_Illustrator_CC_icon.svg", // 4: Illustrator
    "/assets/icons/Adobe_Premiere_Pro_CC_icon.svg", // 5: PremierePro
    "/assets/icons/N8n-logo-new.svg",            // 6: N8n
    "/assets/icons/React-icon.svg"               // 7: React
  ]);

  // Software map matching ApplicationsUsed.txt
  const sMap = {
    "Photoshop": 0, "Blender": 1, "UnrealEngine": 2, "AfterEffects": 3,
    "Illustrator": 4, "PremierePro": 5, "N8n": 6, "React": 7
  };

  const designProjects = [
    { software: ["Blender", "PremierePro"] },
    { software: ["Blender", "Photoshop"] },
    { software: ["Blender", "Photoshop"] },
    { software: ["Blender", "PremierePro"] },
    { software: ["Blender", "PremierePro", "AfterEffects"] },
    { software: ["Blender", "PremierePro"] },
    { software: ["Blender"] },
    { software: ["Blender", "PremierePro"] },
    { software: ["Blender"] },
    { software: ["Photoshop"] },
    { software: ["Photoshop"] },
    { software: ["Photoshop"] },
    { software: ["Blender", "Photoshop"] }
  ];

  // Panel Config
  const panelCount = 10;
  const radius = 2.4; // Slightly wider for better clarity

  const mesh = nodes.Cube || Object.values(nodes).find(node => node.type === "Mesh");

  return (
    <>
      <Environment preset="city" />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />

      {/* Grouping allows us to easily offset both the photo and the panels to the right */}
      <group position={[1, 0, 0]}>

        {/* Event-Driven Rotating Panels */}
        {[...Array(panelCount)].map((_, i) => {
          
          // Determine which panel faces the front according to the projectIndex
          const currentFront = projectIndex % panelCount;
          let assignedIconIndex = null;
          
          const softwareList = designProjects[projectIndex]?.software || [];
          
          // Inject icons strategically around the front of the wheel based on software count
          if (i === currentFront && softwareList.length > 0) {
            assignedIconIndex = sMap[softwareList[0]]; // Primary tool goes exactly at front center
          } else if (i === (currentFront + 1) % panelCount && softwareList.length > 1) {
            assignedIconIndex = sMap[softwareList[1]]; // Secondary tool goes one panel above
          } else if (i === (currentFront + 9) % panelCount && softwareList.length > 2) {
            assignedIconIndex = sMap[softwareList[2]]; // Tertiary tool goes one panel below
          }

          return (
            <SinglePanel
              key={i}
              mesh={mesh}
              initialAngle={(i / panelCount) * Math.PI * 2}
              radius={radius}
              activeIndex={projectIndex} // Use raw projectIndex so it natively loops > 10
              panelCount={panelCount}
              iconTexture={assignedIconIndex !== null ? icons[assignedIconIndex] : null}
            />
          );
        })}
      </group>
    </>
  );
};

export default Hero3D;
