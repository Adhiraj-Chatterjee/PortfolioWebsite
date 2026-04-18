import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment, Center, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { useControls, button } from 'leva';

export default function TableScene() {
    const { scene } = useGLTF("/assets/Portfolio TABLE scene.glb");
    const { camera } = useThree();

    const { position, rotation } = useControls('Model', {
        position: [0, 0, 0],
        rotation: [-Math.PI / 2, 0, Math.PI]
    });

    const { envIntensity } = useControls('Materials', {
        envIntensity: { value: 0.2, min: 0, max: 2, step: 0.05 },
    });

    // Fix all PBR maps and shadows on every mesh inside the GLB
    useEffect(() => {
        scene.traverse((child) => {
            if (child.name === 'Plane.001') {
                const worldPos = new THREE.Vector3();
                child.getWorldPosition(worldPos);
                console.log(`--- Picture Frame (Plane.001) World Position: [${worldPos.x.toFixed(3)}, ${worldPos.y.toFixed(3)}, ${worldPos.z.toFixed(3)}] ---`);
            }
            if (child.isMesh) {
                // Compute tangents so normal maps render correctly
                if (child.geometry) {
                    child.geometry.computeTangents();
                }

                child.castShadow = true;
                child.receiveShadow = true;

                const mat = child.material;
                if (mat) {
                    // Upgrade to MeshPhysicalMaterial for better reflections/clearcoat
                    // if (mat.type !== 'MeshPhysicalMaterial') {
                    //     const oldMat = mat;
                    //     child.material = new THREE.MeshPhysicalMaterial();
                    //     THREE.MeshStandardMaterial.prototype.copy.call(child.material, oldMat);
                    // }

                    const newMat = child.material;

                    // Fix texture color spaces so maps are read correctly by modern Three.js
                    if (newMat.normalMap) { newMat.normalMap.colorSpace = THREE.NoColorSpace; }
                    if (newMat.roughnessMap) { newMat.roughnessMap.colorSpace = THREE.NoColorSpace; }
                    if (newMat.metalnessMap) { newMat.metalnessMap.colorSpace = THREE.NoColorSpace; }
                    if (newMat.map) { newMat.map.colorSpace = THREE.SRGBColorSpace; }

                    // Bump up the normal scale to make the baked grain pop
                    newMat.normalScale = new THREE.Vector2(2.5, 2.5);
                    
                    // Enable high-end physical properties
                    // newMat.clearcoat = 1.0;
                    // newMat.clearcoatRoughness = 0.1;
                    newMat.envMapIntensity = envIntensity;
                    
                    newMat.needsUpdate = true;
                }
            }
        });
    }, [scene, envIntensity]);


    const { target } = useControls('Camera', {
        target: { value: [-0.87, -0.86, 0.65], step: 0.1 },
        'Log Camera Data': button(() => {
            console.log(`Camera Position: [${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}]`);
            console.log(`Camera Target: [${target[0]}, ${target[1]}, ${target[2]}]`);
        })
    });

    const lightControls = useControls('Lighting', {
        dirIntensity: { value: 1.5, min: 0, max: 20, step: 0.1 },
        dirPosition: { value: [6.0, 8.5, 5.0], step: 0.5 },
        dirColor: { value: '#fff8f0' },
        shadowBias: { value: -0.0011, min: -0.01, max: 0.01, step: 0.0001 },
        shadowMapSize: { value: 4096, options: [512, 1024, 2048, 4096] },
        'Log Light Data': button(() => {
            console.log("--- Current Lighting Data ---");
            console.log(`Intensity: ${lightControls.dirIntensity}`);
            console.log(`Position: [${lightControls.dirPosition.join(', ')}]`);
            console.log(`Color: ${lightControls.dirColor}`);
            console.log(`Shadow Bias: ${lightControls.shadowBias}`); // This will show the full float value
            console.log(`Shadow Map Size: ${lightControls.shadowMapSize}`);
        })
    });

    const targetVector = new THREE.Vector3(...target);

    // Initial look at
    useEffect(() => {
        camera.lookAt(targetVector);
    }, [camera, targetVector]);

    // Camera focus (lookAt) and parallax are now handled in the parent Experience.jsx loop 
    // to ensure frame-perfect synchronization between position and rotation.

    return (
        <>
            <directionalLight
                position={lightControls.dirPosition}
                intensity={lightControls.dirIntensity}
                color={lightControls.dirColor}
                castShadow
                shadow-mapSize={[lightControls.shadowMapSize, lightControls.shadowMapSize]}
                shadow-bias={lightControls.shadowBias}
                shadow-camera-near={0.1}
                shadow-camera-far={30}
                shadow-camera-left={-3}
                shadow-camera-right={3}
                shadow-camera-top={3}
                shadow-camera-bottom={-3}
                shadow-radius={10}
            />

            {/* Low-intensity environment as subtle fill — preserves shadow contrast */}
            <Environment files="/assets/anniversary_lounge_4k.exr" environmentIntensity={envIntensity} background={false} />


            <Center>
                <primitive
                    object={scene}
                    position={position}
                    rotation={rotation}
                />
            </Center>

            {/* Soft baked contact shadow directly on the table surface */}
            {/* <ContactShadows
                position={[0.15, -1.48, 0]}
                opacity={0.85}
                scale={3}
                blur={2.0}
                far={2}
                resolution={512}
                color="#000000"
            /> */}
        </>
    );
}

useGLTF.preload("/assets/Portfolio TABLE scene.glb");
