import React, { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF, Center } from '@react-three/drei';
import * as THREE from 'three';
import { useControls, button } from 'leva';

export default function TableScene() {
    const { scene } = useGLTF("/assets/Portfolio TABLE scene.glb");
    const { camera } = useThree();

    const { position, rotation } = useControls('Model', {
        position: [0, 0, 0],
        rotation: [-Math.PI / 2, 0, Math.PI]
    });

    const { target } = useControls('Camera', {
        target: { value: [-0.87, -0.86, 0.65], step: 0.1 },
        'Log Camera Data': button(() => {
            console.log(`Camera Position: [${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}]`);
            console.log(`Camera Target: [${target[0]}, ${target[1]}, ${target[2]}]`);
        })
    });

    // Convert all materials to MeshBasicMaterial so they render purely from
    // baked textures — zero lighting, zero env map influence.
    useEffect(() => {
        scene.traverse((child) => {
            if (child.isMesh) {
                const oldMat = child.material;

                // Grab the baked colour/albedo map
                const map = oldMat.map ?? null;
                if (map) {
                    map.colorSpace = THREE.SRGBColorSpace;
                }

                // Replace with a completely unlit material
                child.material = new THREE.MeshBasicMaterial({
                    map,
                    transparent: oldMat.transparent ?? false,
                    alphaTest: oldMat.alphaTest ?? 0,
                    side: oldMat.side ?? THREE.FrontSide,
                });

                // Dispose the old material to free GPU memory
                oldMat.dispose();
            }
        });
    }, [scene]);

    // Initial look at
    const targetVector = new THREE.Vector3(...target);
    useEffect(() => {
        camera.lookAt(targetVector);
    }, [camera, targetVector]);

    return (
        <Center>
            <primitive
                object={scene}
                position={position}
                rotation={rotation}
            />
        </Center>
    );
}

useGLTF.preload("/assets/Portfolio TABLE scene.glb");
