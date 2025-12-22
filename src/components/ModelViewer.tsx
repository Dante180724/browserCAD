import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { VirtualFileSystem } from "../utils/VirtualFileSystem";

interface ModelViewerProps {
  fileSystem: VirtualFileSystem | null;
}

export function ModelViewer({ fileSystem }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const currentModelRef = useRef<THREE.Group | null>(null);

  // Clipping planes state
  const [horizontalClipEnabled, setHorizontalClipEnabled] = useState(false);
  const [verticalClipEnabled, setVerticalClipEnabled] = useState(false);
  const [horizontalClipPosition, setHorizontalClipPosition] = useState(0);
  const [verticalClipPosition, setVerticalClipPosition] = useState(0);
  const horizontalPlaneRef = useRef<THREE.Plane | null>(null);
  const verticalPlaneRef = useRef<THREE.Plane | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.01, // Near plane
      10000 // Far plane - very large to ensure we can see everything
    );
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const canvasWidth = containerRef.current.clientWidth;
    const canvasHeight = containerRef.current.clientHeight;

    renderer.setSize(canvasWidth, canvasHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true; // Enable clipping planes

    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    containerRef.current.appendChild(canvas);
    rendererRef.current = renderer;

    // Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = true;
    controls.minDistance = 0.1;
    controls.maxDistance = 1000;
    controls.enabled = true;
    controlsRef.current = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight2.position.set(-10, 5, -10);
    scene.add(directionalLight2);

    // Grid helper
    const gridHelper = new THREE.GridHelper(20, 20, 0xcccccc, 0xe0e0e0);
    scene.add(gridHelper);

    // Initialize clipping planes
    // Horizontal plane (cuts along Y axis)
    horizontalPlaneRef.current = new THREE.Plane(
      new THREE.Vector3(0, -1, 0),
      0
    );
    // Vertical plane (cuts along Z axis)
    verticalPlaneRef.current = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

    // Animation loop
    let frameCount = 0;
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      frameCount++;
    };

    animate();

    // Handle window resize
    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      controls.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    if (!fileSystem || !sceneRef.current) return;

    let cancelled = false;

    // Remove previous model
    if (currentModelRef.current) {
      sceneRef.current.remove(currentModelRef.current);
      currentModelRef.current = null;
    }

    // Find the model file
    const modelFile = fileSystem.findModelFile();
    if (!modelFile) {
      console.error("No .gltf or .glb file found");
      return;
    }

    const loadModel = async () => {
      let modelBlobUrl: string;
      let shouldCleanupModelUrl = false;

      // For .glb files, load directly using cached blob URL
      if (modelFile.file.name.endsWith(".glb")) {
        modelBlobUrl = modelFile.url;
      } else {
        // For .gltf files, we need to modify the JSON to replace paths with blob URLs
        const gltfText = await modelFile.file.text();
        const gltfJson = JSON.parse(gltfText);

        // Get the base path from the model file
        const basePath = modelFile.path.substring(
          0,
          modelFile.path.lastIndexOf("/") + 1
        );

        // Helper function to resolve path
        const resolvePath = (relativePath: string): string => {
          const fullPath = basePath + relativePath;
          const fileData =
            fileSystem.getFile(fullPath) || fileSystem.getFile(relativePath);

          if (fileData) {
            // Use the already created blob URL!
            return fileData.url;
          }

          console.warn("File not found:", relativePath);
          return relativePath;
        };

        // Replace buffer URIs
        if (gltfJson.buffers) {
          gltfJson.buffers = gltfJson.buffers.map((buffer: any) => {
            if (buffer.uri && !buffer.uri.startsWith("data:")) {
              return { ...buffer, uri: resolvePath(buffer.uri) };
            }
            return buffer;
          });
        }

        // Replace image URIs
        if (gltfJson.images) {
          gltfJson.images = gltfJson.images.map((image: any) => {
            if (image.uri && !image.uri.startsWith("data:")) {
              return { ...image, uri: resolvePath(image.uri) };
            }
            return image;
          });
        }

        // Create a new blob with modified GLTF
        const modifiedGltfText = JSON.stringify(gltfJson);
        const modifiedBlob = new Blob([modifiedGltfText], {
          type: "model/gltf+json",
        });
        modelBlobUrl = URL.createObjectURL(modifiedBlob);
        shouldCleanupModelUrl = true; // We created this URL, so clean it up
      }

      // Load the model
      const loader = new GLTFLoader();
      loader.load(
        modelBlobUrl,
        (gltf) => {
          if (cancelled) return;

          const model = gltf.scene;

          // Center the model
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());

          model.position.sub(center);

          // Scale model to fit in view
          const maxDim = Math.max(size.x, size.y, size.z);
          const scale = 3 / maxDim;
          model.scale.multiplyScalar(scale);

          // Enable shadows and apply clipping planes
          model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;

              // Apply clipping planes to material
              if (child.material) {
                // Handle both single material and array of materials
                const materials = Array.isArray(child.material)
                  ? child.material
                  : [child.material];
                materials.forEach((mat) => {
                  mat.clippingPlanes = [];
                  mat.clipShadows = true;
                });
              }
            }
          });

          sceneRef.current?.add(model);
          currentModelRef.current = model;

          // Reset camera and controls to look at the model
          if (cameraRef.current && controlsRef.current) {
            // Position camera at a good distance based on model size
            const distance = maxDim * scale * 2;
            cameraRef.current.position.set(distance, distance, distance);
            cameraRef.current.lookAt(0, 0, 0);
            controlsRef.current.target.set(0, 0, 0);
            controlsRef.current.update();
          }

          // Only revoke if we created this URL (for modified .gltf)
          if (shouldCleanupModelUrl) {
            URL.revokeObjectURL(modelBlobUrl);
          }
        },
        undefined,
        (error) => {
          console.error("Error loading model:", error);

          // Only revoke if we created this URL (for modified .gltf)
          if (shouldCleanupModelUrl) {
            URL.revokeObjectURL(modelBlobUrl);
          }
        }
      );
    };

    loadModel();

    return () => {
      cancelled = true;
    };
  }, [fileSystem]);

  // Update clipping planes when state changes
  useEffect(() => {
    if (!currentModelRef.current) return;

    // Update plane positions
    if (horizontalPlaneRef.current) {
      horizontalPlaneRef.current.constant = horizontalClipPosition;
    }
    if (verticalPlaneRef.current) {
      verticalPlaneRef.current.constant = verticalClipPosition;
    }

    // Apply clipping planes to all materials in the model
    currentModelRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        materials.forEach((mat) => {
          const planes: THREE.Plane[] = [];

          if (horizontalClipEnabled && horizontalPlaneRef.current) {
            planes.push(horizontalPlaneRef.current);
          }
          if (verticalClipEnabled && verticalPlaneRef.current) {
            planes.push(verticalPlaneRef.current);
          }

          mat.clippingPlanes = planes;
          mat.needsUpdate = true;
        });
      }
    });
  }, [
    horizontalClipEnabled,
    verticalClipEnabled,
    horizontalClipPosition,
    verticalClipPosition,
  ]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div
        ref={containerRef}
        className="model-viewer"
        style={{ width: "100%", height: "100%", color: "black" }}
      />

      {/* Clipping controls */}
      <div
        style={{
          position: "absolute",
          top: "100px",
          right: "20px",
          background: "rgba(66, 100, 131, 0.9)",
          padding: "15px",
          borderRadius: "8px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
          minWidth: "250px",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <h3
          style={{
            margin: "0 0 15px 0",
            fontSize: "14px",
            fontWeight: "600",
          }}
        >
          Разрезы модели
        </h3>

        {/* Horizontal clipping */}
        <div style={{ marginBottom: "15px" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "8px",
              fontSize: "13px",
            }}
          >
            <input
              type="checkbox"
              checked={horizontalClipEnabled}
              onChange={(e) => setHorizontalClipEnabled(e.target.checked)}
              style={{ marginRight: "8px", color: "black" }}
            />
            Горизонтальный разрез
          </label>
          {horizontalClipEnabled && (
            <div style={{ marginLeft: "20px" }}>
              <input
                type="range"
                min="-2"
                max="2"
                step="0.01"
                value={horizontalClipPosition}
                onChange={(e) =>
                  setHorizontalClipPosition(parseFloat(e.target.value))
                }
                style={{ width: "100%" }}
              />
              <div
                style={{
                  fontSize: "11px",
                  color: "#c5c0c0ff",
                  marginTop: "4px",
                }}
              >
                Позиция: {horizontalClipPosition.toFixed(2)}
              </div>
            </div>
          )}
        </div>

        {/* Vertical clipping */}
        <div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "8px",
              fontSize: "13px",
            }}
          >
            <input
              type="checkbox"
              checked={verticalClipEnabled}
              onChange={(e) => setVerticalClipEnabled(e.target.checked)}
              style={{ marginRight: "8px", color: "black" }}
            />
            Вертикальный разрез
          </label>
          {verticalClipEnabled && (
            <div style={{ marginLeft: "20px" }}>
              <input
                type="range"
                min="-2"
                max="2"
                step="0.01"
                value={verticalClipPosition}
                onChange={(e) =>
                  setVerticalClipPosition(parseFloat(e.target.value))
                }
                style={{ width: "100%" }}
              />
              <div
                style={{
                  fontSize: "11px",
                  color: "#c5c0c0ff",
                  marginTop: "4px",
                }}
              >
                Позиция: {verticalClipPosition.toFixed(2)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
