import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { VirtualFileSystem } from "../../utils/VirtualFileSystem";
import "./style.css";
import {
  Tabs,
  Card,
  Text,
  HStack,
  Button,
  Slider,
  useSlider,
  Box,
  Checkbox,
  useCheckbox,
  CheckboxRootProvider,
  Select,
  createListCollection,
  Portal,
} from "@chakra-ui/react";
import { Value } from "three/examples/jsm/inspector/ui/Values.js";

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
  const horizontalClipEnabled = useCheckbox();
  const verticalClipEnabled = useCheckbox();
  const [horizontalClipPosition, setHorizontalClipPosition] = useState(0);
  const [verticalClipPosition, setVerticalClipPosition] = useState(0);
  const horizontalPlaneRef = useRef<THREE.Plane | null>(null);
  const verticalPlaneRef = useRef<THREE.Plane | null>(null);

  // Dimensions state
  const [dimensionsEnabled, setDimensionsEnabled] = useState(false);
  const [dimensionUnit, setDimensionUnit] = useState<
    "mm" | "cm" | "m" | "in" | "ft"
  >("mm");
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const dimensionsGroupRef = useRef<THREE.Group | null>(null);

  // Distance measurement state
  const [distanceMeasureEnabled, setDistanceMeasureEnabled] = useState(false);
  const [measuredDistance, setMeasuredDistance] = useState<number | null>(null);
  const clickCountRef = useRef(0);
  const pointsRef = useRef<[THREE.Vector3, THREE.Vector3]>([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  const markerARef = useRef<THREE.Mesh | null>(null);
  const markerBRef = useRef<THREE.Mesh | null>(null);
  const distanceLineRef = useRef<THREE.Line | null>(null);
  const distanceLabelRef = useRef<CSS2DObject | null>(null);

  // Unit conversion factors (from Three.js units to target unit)
  // Assuming Three.js units are in meters by default
  const unitConversions = {
    mm: { factor: 1000, label: "мм" },
    cm: { factor: 100, label: "см" },
    m: { factor: 1, label: "м" },
    in: { factor: 39.3701, label: "дюйм" },
    ft: { factor: 3.28084, label: "фут" },
  };

  console.log(unitConversions);

  const unitsCollection = createListCollection({
    items: Object.entries(unitConversions).map(([value, data]) => ({
      value,
      label: data.label,
    })),
  });

  // Update distance line between two points
  const updateDistanceLine = (pointA: THREE.Vector3, pointB: THREE.Vector3) => {
    if (!distanceLineRef.current) return;
    const positions = distanceLineRef.current.geometry.attributes.position;
    positions.setXYZ(0, pointA.x, pointA.y, pointA.z);
    positions.setXYZ(1, pointB.x, pointB.y, pointB.z);
    positions.needsUpdate = true;
  };

  // Create or update distance label
  const updateDistanceLabel = (distance: number, midPoint: THREE.Vector3) => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Remove previous label
    if (distanceLabelRef.current) {
      if (distanceLabelRef.current.element?.parentNode) {
        distanceLabelRef.current.element.parentNode.removeChild(
          distanceLabelRef.current.element,
        );
      }
      scene.remove(distanceLabelRef.current);
      distanceLabelRef.current = null;
    }

    // Create new label
    const convertedDistance = distance * unitConversions[dimensionUnit].factor;
    const labelDiv = document.createElement("div");
    labelDiv.className = "distance-label";
    labelDiv.textContent = `${convertedDistance.toFixed(2)} ${unitConversions[dimensionUnit].label}`;

    const labelObject = new CSS2DObject(labelDiv);
    labelObject.position.copy(midPoint);
    scene.add(labelObject);
    distanceLabelRef.current = labelObject;
  };

  // Reset distance measurement
  const resetDistanceMeasurement = () => {
    clickCountRef.current = 0;
    setMeasuredDistance(null);

    if (markerARef.current) markerARef.current.visible = false;
    if (markerBRef.current) markerBRef.current.visible = false;
    if (distanceLineRef.current) distanceLineRef.current.visible = false;

    // Remove label
    if (distanceLabelRef.current && sceneRef.current) {
      if (distanceLabelRef.current.element?.parentNode) {
        distanceLabelRef.current.element.parentNode.removeChild(
          distanceLabelRef.current.element,
        );
      }
      sceneRef.current.remove(distanceLabelRef.current);
      distanceLabelRef.current = null;
    }
  };

  // Handle click for distance measurement
  const handleDistanceClick = (event: MouseEvent) => {
    if (!distanceMeasureEnabled) return;
    if (!containerRef.current || !cameraRef.current || !sceneRef.current)
      return;
    if (!currentModelRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    // Only intersect with the model, not markers or helpers
    const intersects = raycaster.intersectObject(currentModelRef.current, true);

    if (intersects.length > 0) {
      const point = intersects[0].point;
      const clickIndex = clickCountRef.current;

      pointsRef.current[clickIndex].copy(point);

      // Update marker position
      const marker = clickIndex === 0 ? markerARef.current : markerBRef.current;
      if (marker) {
        marker.position.copy(point);
        marker.visible = true;
      }

      // Update line to current point (both ends same for first click)
      if (clickIndex === 0) {
        updateDistanceLine(point, point);
        if (distanceLineRef.current) distanceLineRef.current.visible = true;
      }

      clickCountRef.current++;

      if (clickCountRef.current > 1) {
        // Calculate and display distance
        const distance = pointsRef.current[0].distanceTo(pointsRef.current[1]);
        setMeasuredDistance(distance);
        updateDistanceLine(pointsRef.current[0], pointsRef.current[1]);

        // Add label at midpoint
        const midPoint = new THREE.Vector3()
          .addVectors(pointsRef.current[0], pointsRef.current[1])
          .multiplyScalar(0.5);
        updateDistanceLabel(distance, midPoint);

        clickCountRef.current = 0;
      }
    }
  };

  // Effect for distance measurement click handler
  useEffect(() => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return;

    if (distanceMeasureEnabled) {
      canvas.addEventListener("click", handleDistanceClick);
      canvas.style.cursor = "crosshair";
    } else {
      canvas.style.cursor = "grab";
      resetDistanceMeasurement();
    }

    return () => {
      canvas.removeEventListener("click", handleDistanceClick);
    };
  }, [distanceMeasureEnabled, dimensionUnit]);

  // Update label when unit changes
  useEffect(() => {
    if (measuredDistance !== null && distanceLabelRef.current) {
      const midPoint = new THREE.Vector3()
        .addVectors(pointsRef.current[0], pointsRef.current[1])
        .multiplyScalar(0.5);
      updateDistanceLabel(measuredDistance, midPoint);
    }
  }, [dimensionUnit, measuredDistance]);

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
      10000, // Far plane - very large to ensure we can see everything
    );
    camera.position.set(5, 5, 5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    const canvasWidth = containerRef.current.clientWidth;
    const canvasHeight = containerRef.current.clientHeight;

    renderer.setSize(canvasWidth, canvasHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true; // Enable clipping planes

    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";

    containerRef.current.appendChild(canvas);
    rendererRef.current = renderer;

    // CSS2D Renderer setup for labels
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(canvasWidth, canvasHeight);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    containerRef.current.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;

    const resizeObserver = new ResizeObserver(() => {
      if (
        !containerRef.current ||
        !cameraRef.current ||
        !rendererRef.current ||
        !labelRendererRef.current
      )
        return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();

      rendererRef.current.setSize(width, height);

      rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      labelRendererRef.current.setSize(width, height);
    });

    resizeObserver.observe(containerRef.current);

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
    gridHelper.position.y = -1.0; // Опускаем сетку немного ниже
    scene.add(gridHelper);

    // Distance measurement markers
    const markerGeometry = new THREE.SphereGeometry(0.05, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff5555 });

    const markerA = new THREE.Mesh(markerGeometry, markerMaterial);
    markerA.visible = false;
    scene.add(markerA);
    markerARef.current = markerA;

    const markerB = new THREE.Mesh(
      markerGeometry.clone(),
      markerMaterial.clone(),
    );
    markerB.visible = false;
    scene.add(markerB);
    markerBRef.current = markerB;

    // Distance measurement line
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff5555 });
    const distanceLine = new THREE.Line(lineGeometry, lineMaterial);
    distanceLine.visible = false;
    scene.add(distanceLine);
    distanceLineRef.current = distanceLine;

    // Initialize clipping planes
    // Horizontal plane (cuts along Y axis)
    horizontalPlaneRef.current = new THREE.Plane(
      new THREE.Vector3(0, -1, 0),
      0,
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
      labelRenderer.render(scene, camera);

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
      labelRenderer.setSize(width, height);
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
      if (containerRef.current && labelRenderer.domElement) {
        containerRef.current.removeChild(labelRenderer.domElement);
      }
      // Cleanup distance measurement objects
      if (markerARef.current) {
        markerARef.current.geometry.dispose();
        (markerARef.current.material as THREE.Material).dispose();
      }
      if (markerBRef.current) {
        markerBRef.current.geometry.dispose();
        (markerBRef.current.material as THREE.Material).dispose();
      }
      if (distanceLineRef.current) {
        distanceLineRef.current.geometry.dispose();
        (distanceLineRef.current.material as THREE.Material).dispose();
      }
      if (distanceLabelRef.current?.element?.parentNode) {
        distanceLabelRef.current.element.parentNode.removeChild(
          distanceLabelRef.current.element,
        );
      }
      resizeObserver.disconnect();
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
          modelFile.path.lastIndexOf("/") + 1,
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
        },
      );
    };

    loadModel();

    return () => {
      cancelled = true;
    };
  }, [fileSystem]);

  // Create dimension line with arrows and label
  const createDimensionLine = (
    start: THREE.Vector3,
    end: THREE.Vector3,
    dimensionValue: number,
    axis: string,
    color: number,
  ): THREE.Group => {
    const group = new THREE.Group();

    // Main dimension line
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const lineMaterial = new THREE.LineBasicMaterial({ color, linewidth: 2 });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    group.add(line);

    // Arrow at start
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const arrowLength = 0.15;
    const arrowStart = new THREE.ArrowHelper(
      direction.clone().negate(),
      start,
      arrowLength,
      color,
      arrowLength * 0.6,
      arrowLength * 0.4,
    );
    group.add(arrowStart);

    // Arrow at end
    const arrowEnd = new THREE.ArrowHelper(
      direction,
      end,
      arrowLength,
      color,
      arrowLength * 0.6,
      arrowLength * 0.4,
    );
    group.add(arrowEnd);

    // Convert dimension to selected unit
    const convertedValue =
      dimensionValue * unitConversions[dimensionUnit].factor;
    const unitLabel = unitConversions[dimensionUnit].label;

    // Text label
    const midPoint = new THREE.Vector3()
      .addVectors(start, end)
      .multiplyScalar(0.5);
    const labelDiv = document.createElement("div");
    labelDiv.className = "dimension-label";
    labelDiv.textContent = `${axis}: ${convertedValue.toFixed(2)} ${unitLabel}`;
    labelDiv.style.color = "#" + color.toString(16).padStart(6, "0");
    labelDiv.style.fontSize = "14px";
    labelDiv.style.fontWeight = "bold";
    labelDiv.style.backgroundColor = "rgba(255, 255, 255, 0.9)";
    labelDiv.style.padding = "4px 8px";
    labelDiv.style.borderRadius = "4px";
    labelDiv.style.border = "1px solid #" + color.toString(16).padStart(6, "0");
    labelDiv.style.whiteSpace = "nowrap";

    const labelObject = new CSS2DObject(labelDiv);
    labelObject.position.copy(midPoint);
    group.add(labelObject);

    return group;
  };

  // Update dimensions display
  useEffect(() => {
    if (!currentModelRef.current || !sceneRef.current) return;

    // Remove previous dimensions
    if (dimensionsGroupRef.current) {
      sceneRef.current.remove(dimensionsGroupRef.current);

      // Properly dispose all children including CSS2DObject
      dimensionsGroupRef.current.traverse((child) => {
        if (child instanceof CSS2DObject) {
          // Remove CSS2D element from DOM
          if (child.element && child.element.parentNode) {
            child.element.parentNode.removeChild(child.element);
          }
        } else if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material?.dispose();
          }
        }
      });

      // Clear all children
      while (dimensionsGroupRef.current.children.length > 0) {
        dimensionsGroupRef.current.remove(
          dimensionsGroupRef.current.children[0],
        );
      }

      dimensionsGroupRef.current = null;
    }

    if (!dimensionsEnabled) return;

    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(currentModelRef.current);
    const size = box.getSize(new THREE.Vector3());
    const min = box.min;
    const max = box.max;

    const dimensionsGroup = new THREE.Group();
    const offset = 0.5; // Offset from model

    // X dimension (Width) - Red
    const xStart = new THREE.Vector3(min.x, min.y - offset, min.z - offset);
    const xEnd = new THREE.Vector3(max.x, min.y - offset, min.z - offset);
    const xLine = createDimensionLine(xStart, xEnd, size.x, "X", 0xff0000);
    dimensionsGroup.add(xLine);

    // Y dimension (Height) - Green
    const yStart = new THREE.Vector3(min.x - offset, min.y, min.z - offset);
    const yEnd = new THREE.Vector3(min.x - offset, max.y, min.z - offset);
    const yLine = createDimensionLine(yStart, yEnd, size.y, "Y", 0x00ff00);
    dimensionsGroup.add(yLine);

    // Z dimension (Depth) - Blue
    const zStart = new THREE.Vector3(min.x - offset, min.y - offset, min.z);
    const zEnd = new THREE.Vector3(min.x - offset, min.y - offset, max.z);
    const zLine = createDimensionLine(zStart, zEnd, size.z, "Z", 0x0000ff);
    dimensionsGroup.add(zLine);

    // Add bounding box helper for reference
    const boxHelper = new THREE.Box3Helper(box, 0x888888);
    dimensionsGroup.add(boxHelper);

    sceneRef.current.add(dimensionsGroup);
    dimensionsGroupRef.current = dimensionsGroup;
  }, [dimensionsEnabled, dimensionUnit, currentModelRef.current]);

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

          if (horizontalClipEnabled.checked && horizontalPlaneRef.current) {
            planes.push(horizontalPlaneRef.current);
          }
          if (verticalClipEnabled.checked && verticalPlaneRef.current) {
            planes.push(verticalPlaneRef.current);
          }

          mat.clippingPlanes = planes;
          mat.needsUpdate = true;
        });
      }
    });
  }, [
    horizontalClipEnabled.checked,
    verticalClipEnabled.checked,

    horizontalClipPosition,
    verticalClipPosition,
  ]);

  const horizontalSlider = useSlider({
    defaultValue: [0],
    thumbAlignment: "contain",
    min: -2,
    max: 3,
    step: 0.0001,
  });

  const verticalSlider = useSlider({
    defaultValue: [0],
    thumbAlignment: "contain",
    min: -2,
    max: 3,
    step: 0.0001,
  });

  useEffect(() => {
    setHorizontalClipPosition(horizontalSlider.value[0]);
  }, [horizontalSlider.value]);

  useEffect(() => {
    setVerticalClipPosition(verticalSlider.value[0]);
  }, [verticalSlider.value]);

  return (
    <div className="model-viewer-wrapper">
      <div ref={containerRef} className="model-viewer" />
      <Card.Root
        bg="rgba(20, 23, 28, 0.75)"
        color="gray.100"
        border="1px solid"
        borderColor="whiteAlpha.200"
        shadow="2xl"
        backdropFilter="blur(12px)"
        className="controls-panel"
      >
        <Card.Header
          borderBottom="1px solid"
          borderColor="whiteAlpha.200"
          className="controls-panel__title"
        >
          <Text fontSize="lg" fontWeight="semibold">
            Измерения
          </Text>
        </Card.Header>

        <Card.Body>
          {/* Clipping controls */}
          <Tabs.Root defaultValue="clippingPanels" variant="plain">
            {/* Horizontal clipping */}
            <Tabs.List bg="bg.muted" gap="2px" rounded="l3" p="1" mb="15px">
              <Tabs.Trigger value="clippingPanels">Сечения</Tabs.Trigger>
              <Tabs.Trigger value="dimensions">Размеры</Tabs.Trigger>
              <Tabs.Trigger value="distanceMeasurement">
                Измерение расстояния
              </Tabs.Trigger>
              <Tabs.Indicator rounded="l2" />
            </Tabs.List>

            <Tabs.Content value="clippingPanels">
              <div className="control-section">
                <label className="control-label">
                  <Checkbox.RootProvider
                    value={horizontalClipEnabled}
                    onChange={() => {
                      horizontalClipEnabled.setChecked(
                        !horizontalClipEnabled.checked,
                      );
                    }}
                  >
                    <Checkbox.Root>
                      <Checkbox.HiddenInput />
                      <Checkbox.Control />
                      <Checkbox.Label>Горизонтальный разрез</Checkbox.Label>
                    </Checkbox.Root>
                  </Checkbox.RootProvider>
                </label>
                {horizontalClipEnabled.checked && (
                  <Box>
                    <Slider.RootProvider value={horizontalSlider} width="450px">
                      <Slider.Control>
                        <Slider.Track>
                          <Slider.Range />
                        </Slider.Track>
                        <Slider.Thumb index={0}>
                          <Slider.HiddenInput />
                        </Slider.Thumb>
                      </Slider.Control>
                    </Slider.RootProvider>
                    <Text fontSize="11px">
                      Позиция: {horizontalSlider.value}
                    </Text>
                  </Box>
                )}
              </div>

              {/* Vertical clipping */}
              <div className="control-section">
                <label className="control-label">
                  <Checkbox.RootProvider
                    value={verticalClipEnabled}
                    onChange={() => {
                      verticalClipEnabled.setChecked(
                        !verticalClipEnabled.checked,
                      );
                    }}
                  >
                    <Checkbox.Root>
                      <Checkbox.HiddenInput />
                      <Checkbox.Control />
                      <Checkbox.Label>Вертикальный разрез</Checkbox.Label>
                    </Checkbox.Root>
                  </Checkbox.RootProvider>
                </label>
                {verticalClipEnabled.checked && (
                  <Box>
                    <Slider.RootProvider value={verticalSlider} width="450px">
                      <Slider.Control>
                        <Slider.Track>
                          <Slider.Range />
                        </Slider.Track>
                        <Slider.Thumb index={0}>
                          <Slider.HiddenInput />
                        </Slider.Thumb>
                      </Slider.Control>
                    </Slider.RootProvider>
                    <Text fontSize="11px">Позиция: {verticalSlider.value}</Text>
                  </Box>
                )}
              </div>
            </Tabs.Content>

            {/* Dimensions */}
            <Tabs.Content value="dimensions">
              <div className="control-section control-section--bordered">
                <label className="control-label">
                  <Checkbox.Root
                    checked={dimensionsEnabled}
                    onCheckedChange={(e) => setDimensionsEnabled(!!e.checked)}
                  >
                    <Checkbox.HiddenInput />
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Checkbox.Label> Показать размеры модели</Checkbox.Label>
                  </Checkbox.Root>
                </label>
                {dimensionsEnabled && (
                  <div className="dimensions-container">
                    <Select.Root
                      collection={unitsCollection}
                      value={[dimensionUnit]}
                      variant="subtle"
                      onValueChange={(e) =>
                        setDimensionUnit(e.value[0] as typeof dimensionUnit)
                      }
                      size="xs"
                      width="100%"
                      mb="5px"
                    >
                      <Select.HiddenSelect />
                      <Select.Label>Выберите ед.измерения</Select.Label>
                      <Select.Control>
                        <Select.Trigger
                          bg="rgba(255, 255, 255, 0.06)"
                          backdropFilter="blur(10px)"
                          border="1px solid"
                          borderColor="whiteAlpha.200"
                          _hover={{ bg: "rgba(255,255,255,0.12)" }}
                          _expanded={{ bg: "rgba(255,255,255,0.16)" }}
                        >
                          <Select.ValueText placeholder="Выберите ед.измерения" />
                        </Select.Trigger>
                        <Select.IndicatorGroup>
                          <Select.Indicator />
                        </Select.IndicatorGroup>
                      </Select.Control>
                      <Portal>
                        <Select.Positioner>
                          <Select.Content
                            bg="rgba(70,70,70,0.15)"
                            backdropFilter="blur(75px)"
                            border="1px solid"
                            borderColor="rgba(200, 200, 200, 0.25)"
                            boxShadow="0 8px 32px rgba(0,0,0,0.25)"
                            color="gray.100"
                          >
                            {unitsCollection.items.map((unit) => (
                              <Select.Item
                                item={unit}
                                key={unit.value}
                                _hover={{ bg: "rgba(255,255,255,0.1)" }}
                              >
                                {unit.label}

                                <Select.ItemIndicator />
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Positioner>
                      </Portal>
                    </Select.Root>
                    <div className="dimensions-legend">
                      <div>🔴 Красный = Ширина (X)</div>
                      <div>🟢 Зелёный = Высота (Y)</div>
                      <div>🔵 Синий = Глубина (Z)</div>
                    </div>
                  </div>
                )}
              </div>
            </Tabs.Content>

            {/* Distance Measurement */}
            <Tabs.Content value="distanceMeasurement">
              <div className="control-section control-section--bordered">
                <label className="control-label">
                  <Checkbox.Root
                    checked={distanceMeasureEnabled}
                    onCheckedChange={(e) =>
                      setDistanceMeasureEnabled(!!e.checked)
                    }
                  >
                    <Checkbox.HiddenInput />
                    <Checkbox.Control>
                      <Checkbox.Indicator />
                    </Checkbox.Control>
                    <Checkbox.Label> Измерение расстояния</Checkbox.Label>
                  </Checkbox.Root>
                </label>
                {distanceMeasureEnabled && (
                  <div className="distance-container">
                    <div className="distance-instructions">
                      Кликните на две точки модели для измерения расстояния
                      между ними
                    </div>
                    <div className="dimensions-select-wrapper">
                      <Select.Root
                        collection={unitsCollection}
                        value={[dimensionUnit]}
                        variant="subtle"
                        onValueChange={(e) =>
                          setDimensionUnit(e.value[0] as typeof dimensionUnit)
                        }
                        size="xs"
                        width="100%"
                      >
                        <Select.HiddenSelect />
                        <Select.Label>Выберите ед.измерения</Select.Label>
                        <Select.Control>
                          <Select.Trigger
                            width="100%"
                            bg="rgba(255, 255, 255, 0.06)"
                            backdropFilter="blur(10px)"
                            border="1px solid"
                            borderColor="whiteAlpha.200"
                            _hover={{ bg: "rgba(255,255,255,0.12)" }}
                            _expanded={{ bg: "rgba(255,255,255,0.16)" }}
                          >
                            <Select.ValueText placeholder="Выберите ед.измерения" />
                          </Select.Trigger>
                          <Select.IndicatorGroup>
                            <Select.Indicator />
                          </Select.IndicatorGroup>
                        </Select.Control>
                        <Portal>
                          <Select.Positioner>
                            <Select.Content
                              bg="rgba(70,70,70,0.15)"
                              backdropFilter="blur(75px)"
                              border="1px solid"
                              borderColor="rgba(200, 200, 200, 0.25)"
                              boxShadow="0 8px 32px rgba(0,0,0,0.25)"
                              color="gray.100"
                            >
                              {unitsCollection.items.map((unit) => (
                                <Select.Item
                                  item={unit}
                                  key={unit.value}
                                  _hover={{ bg: "rgba(255,255,255,0.1)" }}
                                >
                                  {unit.label}

                                  <Select.ItemIndicator />
                                </Select.Item>
                              ))}
                            </Select.Content>
                          </Select.Positioner>
                        </Portal>
                      </Select.Root>
                    </div>
                    {measuredDistance !== null && (
                      <div className="distance-result">
                        <strong>Расстояние:</strong>{" "}
                        {(
                          measuredDistance *
                          unitConversions[dimensionUnit].factor
                        ).toFixed(2)}{" "}
                        {unitConversions[dimensionUnit].label}
                      </div>
                    )}
                    <Button
                      width="100%"
                      size="sm"
                      variant="subtle"
                      onClick={resetDistanceMeasurement}
                    >
                      Сбросить измерение
                    </Button>
                  </div>
                )}
              </div>
            </Tabs.Content>
          </Tabs.Root>
        </Card.Body>
      </Card.Root>
    </div>
  );
}
