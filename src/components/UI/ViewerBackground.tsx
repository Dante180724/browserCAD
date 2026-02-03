import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import * as THREE from "three";

interface ViewerBackgroundProps {
  children?: ReactNode;
}

const containerStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "100vh",
  overflow: "hidden",
};

const canvasContainerStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

const childrenContainerStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 10,
};

export default function ViewerBackground({ children }: ViewerBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const frameIdRef = useRef<number>(0);

  useEffect(() => {
    console.log(
      "[v0] ViewerBackground mounting, containerRef:",
      containerRef.current,
    );
    if (!containerRef.current) return;

    const container = containerRef.current;
    console.log("[v0] Container found, initializing Three.js");

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0a0a0f");
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.z = 10;
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    console.log("[v0] Renderer created and appended to container");

    // Ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
    scene.add(ambientLight);

    // Interactive Particles
    const particleCount = 400;
    const particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const originalPositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      const x = (Math.random() - 0.5) * 20;
      const y = (Math.random() - 0.5) * 20;
      const z = (Math.random() - 0.5) * 20;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      originalPositions[i * 3] = x;
      originalPositions[i * 3 + 1] = y;
      originalPositions[i * 3 + 2] = z;

      colors[i * 3] = 0.2 + Math.random() * 0.3;
      colors[i * 3 + 1] = 0.6 + Math.random() * 0.4;
      colors[i * 3 + 2] = 0.9 + Math.random() * 0.1;
    }

    particleGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3),
    );
    particleGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(colors, 3),
    );

    const particleMaterial = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    // Stars background
    const starCount = 2000;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      const radius = 50 + Math.random() * 50;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = radius * Math.cos(phi);
    }

    starGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(starPositions, 3),
    );

    const starMaterial = new THREE.PointsMaterial({
      size: 0.5,
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      sizeAttenuation: true,
    });

    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    // Wireframe Icosahedron
    const icoGeometry = new THREE.IcosahedronGeometry(2, 1);
    const icoMaterial = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
    });
    const icosahedron = new THREE.Mesh(icoGeometry, icoMaterial);
    scene.add(icosahedron);

    // Glowing orb - inner
    const orbGeometry = new THREE.SphereGeometry(0.3, 32, 32);
    const orbMaterial = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.5,
    });
    const orb = new THREE.Mesh(orbGeometry, orbMaterial);
    scene.add(orb);

    // Glowing orb - outer glow
    const glowGeometry = new THREE.SphereGeometry(0.5, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.1,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    scene.add(glow);

    // Animated rings
    const rings: THREE.Mesh[] = [];
    const ringConfigs = [
      { radius: 4, speed: 1 },
      { radius: 5, speed: 0.7 },
      { radius: 6, speed: 0.5 },
    ];

    ringConfigs.forEach((config) => {
      const ringGeometry = new THREE.TorusGeometry(
        config.radius,
        0.02,
        16,
        100,
      );
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0x60a5fa,
        transparent: true,
        opacity: 0.3,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.userData.speed = config.speed;
      scene.add(ring);
      rings.push(ring);
    });

    // Grid floor
    const gridHelper = new THREE.GridHelper(30, 30, 0x3b82f6, 0x1e3a5f);
    gridHelper.position.y = -5;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.5;
    scene.add(gridHelper);

    // Mouse move handler
    const handleMouseMove = (event: MouseEvent) => {
      mouseRef.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };

    window.addEventListener("mousemove", handleMouseMove);

    // Resize handler
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;

      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", handleResize);

    // Animation loop
    const clock = new THREE.Clock();

    const animate = () => {
      frameIdRef.current = requestAnimationFrame(animate);

      const time = clock.getElapsedTime();
      const mouse = mouseRef.current;

      // Animate particles
      const posAttr = particles.geometry.attributes.position;
      const posArray = posAttr.array as Float32Array;

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;

        // Floating animation
        posArray[i3 + 1] =
          originalPositions[i3 + 1] + Math.sin(time + i * 0.1) * 0.3;

        // Mouse influence
        const mouseX = mouse.x * 10;
        const mouseY = mouse.y * 5;
        const dx = posArray[i3] - mouseX;
        const dy = posArray[i3 + 1] - mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 3) {
          const force = (3 - dist) * 0.02;
          posArray[i3] += dx * force;
          posArray[i3 + 1] += dy * force;
        } else {
          // Return to original position
          posArray[i3] += (originalPositions[i3] - posArray[i3]) * 0.01;
        }
      }

      posAttr.needsUpdate = true;
      particles.rotation.y = time * 0.02;

      // Animate stars
      stars.rotation.y = time * 0.01;
      stars.rotation.x = time * 0.005;

      // Animate icosahedron
      icosahedron.rotation.x = time * 0.1 + mouse.y * 0.5;
      icosahedron.rotation.y = time * 0.15 + mouse.x * 0.5;
      const icoScale = 1 + Math.sin(time * 0.5) * 0.05;
      icosahedron.scale.setScalar(icoScale);

      // Animate orb
      const orbIntensity = 0.5 + Math.sin(time * 2) * 0.2;
      orbMaterial.opacity = orbIntensity;

      // Float orb
      orb.position.y = Math.sin(time * 2) * 0.2;
      orb.position.x = Math.cos(time * 1.5) * 0.1;
      glow.position.copy(orb.position);

      // Animate rings
      rings.forEach((ring) => {
        const speed = ring.userData.speed;
        ring.rotation.x = Math.PI * 0.5 + Math.sin(time * speed * 0.3) * 0.2;
        ring.rotation.z = time * speed * 0.2;
      });

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(frameIdRef.current);

      // Dispose geometries and materials
      particleGeometry.dispose();
      particleMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      icoGeometry.dispose();
      icoMaterial.dispose();
      orbGeometry.dispose();
      orbMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      rings.forEach((ring) => {
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
      });

      renderer.dispose();

      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div style={containerStyle}>
      <div ref={containerRef} style={canvasContainerStyle} />
      {children && <div style={childrenContainerStyle}>{children}</div>}
    </div>
  );
}
