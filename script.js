import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Configuration Constants ---
const GRID_SIZE = 45.5; // cm pixels (910mm module / 2)
const WALL_THICKNESS = 10;
const WALL_HEIGHT = 240; // cm

// --- Data Models ---
class FloorPlan {
    constructor() {
        this.walls = [];
        this.furniture = []; // Includes stairs, fixed furniture
        this.openings = []; // { type: 'door'|'window', wallIndex: number, dist: number, width: number }
        this.labels = [];
    }

    load(data) {
        this.walls = data.walls || [];
        this.furniture = data.furniture || [];
        this.openings = data.openings || [];
        this.labels = data.labels || [];
    }
}

// --- 2D Editor ---
class Editor2D {
    constructor(canvas, floorPlan) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.floorPlan = floorPlan;

        this.isDrawing = false;
        this.currentMod = 'wall'; // 'wall' or 'select'
        this.startPoint = null;
        this.currentMousePos = { x: 0, y: 0 };

        // Selection State
        this.selectedFurniture = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };

        // Transform (Pan/Zoom) - Simple implementation
        this.offsetX = 0;
        this.offsetY = 0;
        this.scale = 1;

        this.resize();
        window.addEventListener('resize', () => {
            this.resize();
            this.draw();
        });

        // Bind events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    }

    setMode(mode, type = null) {
        this.currentMod = mode;
        this.activeFurnitureType = type;
        // Clear selection when changing mode
        this.selectedFurniture = null;
        this.draw();
    }

    resize() {
        const parent = this.canvas.parentElement;
        const width = parent.clientWidth;
        const height = parent.clientHeight;
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';

        // Center origin initially
        this.offsetX = this.canvas.width / 2;
        this.offsetY = this.canvas.height / 2;

        // Adjust scale base on DPR transparently? 
        // Or just let transform handle it
        // If we set canvas width to * dpr, everything is drawn small unless we scale up
        // So let's integrate DPR into our base scale or ctx transform
    }

    // Coordinate conversion
    screenToWorld(screenX, screenY) {
        // screenX/Y comes from MouseEvent (CSS pixels)
        // Canvas is scaled by DPR
        // So we need to convert mouse pos to canvas pos
        const dpr = window.devicePixelRatio || 1;
        const canvasX = screenX * dpr;
        const canvasY = screenY * dpr;

        return {
            x: (canvasX - this.offsetX) / (this.scale * dpr),
            y: (canvasY - this.offsetY) / (this.scale * dpr)
        };
    }

    snapToGrid(val) {
        return Math.round(val / GRID_SIZE) * GRID_SIZE;
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const dpr = window.devicePixelRatio || 1;

        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        // Scale by DPR and Zoom level
        this.ctx.scale(this.scale * dpr, this.scale * dpr);

        this.drawGrid();
        this.drawWalls();
        this.drawOpenings();
        this.drawFurniture();

        // Highlight selection
        if (this.selectedFurniture) {
            this.drawSelection(this.selectedFurniture);
        }

        // Draw temporary wall if drawing
        if (this.isDrawing && this.startPoint) {
            this.drawTempWall();
        }

        // Draw ghost furniture if in furniture mode
        if (this.currentMod === 'furniture' && this.activeFurnitureType) {
            this.drawGhostFurniture();
        } else if (this.currentMod === 'opening') {
            // Draw ghost opening
        }

        this.ctx.restore();
    }

    getFurnitureDims(type) {
        // Hardcoded sizes for demo
        switch (type) {
            case 'bed': return { width: 100, depth: 200, color: '#3366cc' };
            case 'table': return { width: 120, depth: 80, color: '#8b4513' };
            case 'sofa': return { width: 200, depth: 90, color: '#555555' };
            case 'stairs': return { width: 91, depth: 182, color: '#e0e0e0', label: 'UP' }; // Typical U-turn or straight
            case 'kitchen': return { width: 255, depth: 65, color: '#cccccc' };
            case 'bath': return { width: 160, depth: 160, color: '#a0aec0' };
            case 'toilet': return { width: 40, depth: 70, color: '#ffffff' };
            default: return { width: 50, depth: 50, color: '#cccccc' };
        }
    }

    drawGhostFurniture() {
        const snapX = this.snapToGrid(this.currentMousePos.x);
        const snapY = this.snapToGrid(this.currentMousePos.y);
        const dims = this.getFurnitureDims(this.activeFurnitureType);

        this.ctx.globalAlpha = 0.5;
        this.ctx.fillStyle = dims.color;
        this.ctx.fillRect(snapX - dims.width / 2, snapY - dims.depth / 2, dims.width, dims.depth);
        this.ctx.globalAlpha = 1.0;
    }

    drawGrid() {
        this.ctx.strokeStyle = '#e5e7eb';
        this.ctx.lineWidth = 1 / this.scale; // Keep line constant screen width

        const left = -this.offsetX / this.scale;
        const top = -this.offsetY / this.scale;
        const right = (this.canvas.width - this.offsetX) / this.scale;
        const bottom = (this.canvas.height - this.offsetY) / this.scale;

        const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
        const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE;

        this.ctx.beginPath();
        for (let x = startX; x < right; x += GRID_SIZE) {
            this.ctx.moveTo(x, top);
            this.ctx.lineTo(x, bottom);
        }
        for (let y = startY; y < bottom; y += GRID_SIZE) {
            this.ctx.moveTo(left, y);
            this.ctx.lineTo(right, y);
        }
        this.ctx.stroke();
    }

    drawWalls() {
        this.ctx.strokeStyle = '#374151';
        this.ctx.lineWidth = WALL_THICKNESS;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();

        this.floorPlan.walls.forEach(wall => {
            this.ctx.moveTo(wall.start.x, wall.start.y);
            this.ctx.lineTo(wall.end.x, wall.end.y);
        });
        this.ctx.stroke();

        // Draw wall joints/points
        this.ctx.fillStyle = '#111827';
        this.floorPlan.walls.forEach(wall => {
            this.ctx.beginPath();
            this.ctx.arc(wall.start.x, wall.start.y, WALL_THICKNESS / 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.arc(wall.end.x, wall.end.y, WALL_THICKNESS / 2, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    drawFurniture() {
        this.floorPlan.furniture.forEach(item => {
            this.ctx.save();
            this.ctx.translate(item.x, item.y);
            this.ctx.rotate((item.rotation * Math.PI) / 180);

            this.ctx.fillStyle = item.color || '#cccccc';
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 1;

            // Draw centered rect
            this.ctx.fillRect(-item.width / 2, -item.depth / 2, item.width, item.depth);
            this.ctx.strokeRect(-item.width / 2, -item.depth / 2, item.width, item.depth);

            // Draw front indicator (triangle)
            this.ctx.fillStyle = '#000';
            this.ctx.beginPath();
            this.ctx.moveTo(0, -item.depth / 2);
            this.ctx.lineTo(-5, -item.depth / 2 + 10);
            this.ctx.lineTo(5, -item.depth / 2 + 10);
            this.ctx.fill();

            this.ctx.restore();
        });
    }

    drawOpenings() {
        // Draw openings on top of walls
        this.floorPlan.openings.forEach(op => {
            const wall = this.floorPlan.walls[op.wallIndex];
            if (!wall) return;

            // Calculate position
            const dx = wall.end.x - wall.start.x;
            const dy = wall.end.y - wall.start.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            // Position along wall
            const ratio = op.dist / len;
            const cx = wall.start.x + dx * ratio;
            const cy = wall.start.y + dy * ratio;

            this.ctx.save();
            this.ctx.translate(cx, cy);
            this.ctx.rotate(angle);

            // Clear wall segment (white rect over wall)
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(-op.width / 2, -WALL_THICKNESS / 2 - 1, op.width, WALL_THICKNESS + 2);

            // Draw symbol
            this.ctx.lineWidth = 1;
            this.ctx.strokeStyle = '#000000';

            if (op.type === 'door') {
                // Quarter circle
                this.ctx.beginPath();
                this.ctx.moveTo(-op.width / 2, WALL_THICKNESS / 2);
                this.ctx.lineTo(-op.width / 2, -op.width + WALL_THICKNESS / 2);
                this.ctx.arc(-op.width / 2, WALL_THICKNESS / 2, op.width, -Math.PI / 2, 0);
                this.ctx.stroke();
            } else if (op.type === 'window') {
                // Double line
                this.ctx.strokeRect(-op.width / 2, -2, op.width, 4);
            }

            this.ctx.restore();
        });
    }

    drawTempWall() {
        const snapX = this.snapToGrid(this.currentMousePos.x);
        const snapY = this.snapToGrid(this.currentMousePos.y);

        this.ctx.strokeStyle = '#4f46e5';
        this.ctx.lineWidth = WALL_THICKNESS;
        this.ctx.globalAlpha = 0.5;
        this.ctx.beginPath();
        this.ctx.moveTo(this.startPoint.x, this.startPoint.y);
        this.ctx.lineTo(snapX, snapY);
        this.ctx.stroke();
        this.ctx.globalAlpha = 1.0;
    }

    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const worldPos = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

        if (this.currentMod === 'wall') {
            this.isDrawing = true;
            this.startPoint = {
                x: this.snapToGrid(worldPos.x),
                y: this.snapToGrid(worldPos.y)
            };
            // Clear selection when drawing
            this.selectedFurniture = null;
            this.draw();

        } else if (this.currentMod === 'select') {
            // Check furniture selection
            const item = this.findFurnitureAt(worldPos.x, worldPos.y);
            if (item) {
                this.selectedFurniture = item;
                this.isDragging = true;
                this.dragOffset = {
                    x: worldPos.x - item.x,
                    y: worldPos.y - item.y
                };
                this.draw();
            } else {
                this.selectedFurniture = null;
                this.draw();
            }
        } else if (this.currentMod === 'furniture') {
            // Place furniture
            const snapX = this.snapToGrid(worldPos.x);
            const snapY = this.snapToGrid(worldPos.y);
            const dims = this.getFurnitureDims(this.activeFurnitureType);

            this.floorPlan.furniture.push({
                type: this.activeFurnitureType,
                x: snapX,
                y: snapY,
                width: dims.width,
                depth: dims.depth,
                rotation: 0,
                color: dims.color
            });
            this.draw();
        }
    }

    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const worldPos = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
        this.currentMousePos = worldPos;

        if (this.isDrawing) {
            this.draw();
        } else if (this.currentMod === 'furniture') {
            this.draw();
        } else if (this.currentMod === 'select' && this.isDragging && this.selectedFurniture) {
            // Drag logic
            const snapX = this.snapToGrid(worldPos.x - this.dragOffset.x);
            const snapY = this.snapToGrid(worldPos.y - this.dragOffset.y);

            this.selectedFurniture.x = snapX;
            this.selectedFurniture.y = snapY;
            this.draw();
        }
    }

    handleMouseUp(e) {
        this.isDragging = false; // Stop dragging

        if (this.isDrawing && this.currentMod === 'wall') {
            const snapX = this.snapToGrid(this.currentMousePos.x);
            const snapY = this.snapToGrid(this.currentMousePos.y);

            // Don't create zero length walls
            if (snapX !== this.startPoint.x || snapY !== this.startPoint.y) {
                this.floorPlan.walls.push({
                    start: this.startPoint,
                    end: { x: snapX, y: snapY }
                });
            }
            this.isDrawing = false;
            this.startPoint = null;
            this.draw();
        }
    }

    // Helper Methods
    findFurnitureAt(x, y) {
        // Simple bounding box check (ignoring rotation for simplicity in hit test, 
        // or check distance to center if we want easy rotation support)
        // Let's use simple distance from center <= radius approx
        for (let i = this.floorPlan.furniture.length - 1; i >= 0; i--) {
            const item = this.floorPlan.furniture[i];
            // Radius approx = max(width, depth) / 2
            const radius = Math.max(item.width, item.depth) / 2;
            const dist = Math.sqrt((x - item.x) ** 2 + (y - item.y) ** 2);
            if (dist <= radius) {
                return item;
            }
        }
        return null; // None found
    }

    drawSelection(item) {
        this.ctx.save();
        this.ctx.translate(item.x, item.y);
        this.ctx.rotate((item.rotation * Math.PI) / 180);

        this.ctx.strokeStyle = '#2563eb'; // Blue highlight
        this.ctx.lineWidth = 2;
        // Draw slightly larger box
        const pad = 5;
        this.ctx.strokeRect(-(item.width / 2) - pad, -(item.depth / 2) - pad, item.width + pad * 2, item.depth + pad * 2);

        this.ctx.restore();
    }

    deleteSelected() {
        if (this.selectedFurniture) {
            const index = this.floorPlan.furniture.indexOf(this.selectedFurniture);
            if (index > -1) {
                this.floorPlan.furniture.splice(index, 1);
                this.selectedFurniture = null;
                this.draw();
            }
        }
    }
}

// --- 3D Viewer ---
class Viewer3D {
    constructor(container, floorPlan) {
        this.container = container;
        this.floorPlan = floorPlan;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;

        // Basic Three.js setup
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0);

        this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 10000);
        this.camera.position.set(0, 800, 1000);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(width, height);
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;

        // Lights
        const ambientLight = new THREE.AmbientLight(0x606060, 3);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
        directionalLight.position.set(100, 1000, 500);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);

        const gridHelper = new THREE.GridHelper(2000, 20);
        this.scene.add(gridHelper);

        this.initialized = true;
        this.animate();
    }

    updateHelper() {
        if (!this.initialized) return;

        // Remove old objects (keep lights and helper)
        const toRemove = [];
        this.scene.traverse(child => {
            if (child.isMesh && child.name !== 'grid') { // Avoid removing grid if it's a mesh, though helper is usually LineSegments
                toRemove.push(child);
            }
        });
        toRemove.forEach(obj => this.scene.remove(obj));

        // Create Walls
        const wallMaterial = new THREE.MeshLambertMaterial({ color: 0xe5e7eb });
        const cutMaterial = new THREE.MeshLambertMaterial({ color: 0xd1d5db }); // Inside cuts

        this.floorPlan.walls.forEach((wall, index) => {
            this.createWallMeshV2(wall, index, wallMaterial);
        });

        // Create Furniture
        this.floorPlan.furniture.forEach(item => {
            if (item.type === 'stairs') {
                this.createStairsMesh(item);
            } else {
                this.createFurnitureMesh(item);
            }
        });
    }

    createWallMeshV2(wall, index, material) {
        const dx = wall.end.x - wall.start.x;
        const dy = wall.end.y - wall.start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        // Find openings for this wall
        const openings = this.floorPlan.openings.filter(op => op.wallIndex === index);

        // Create Shape (Face of the wall)
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(len, 0);
        shape.lineTo(len, WALL_HEIGHT);
        shape.lineTo(0, WALL_HEIGHT);
        shape.lineTo(0, 0);

        // Add Holes
        openings.forEach(op => {
            const hole = new THREE.Path();
            const w = op.width;
            const h = op.type === 'door' ? 200 : 110; // Default heights
            const y = op.type === 'door' ? 0 : 90; // Default elevation

            // Center of opening is at op.dist
            const x = op.dist - w / 2;

            hole.moveTo(x, y);
            hole.lineTo(x + w, y);
            hole.lineTo(x + w, y + h);
            hole.lineTo(x, y + h);
            hole.lineTo(x, y);

            shape.holes.push(hole);
        });

        const extrudeSettings = {
            steps: 1,
            depth: WALL_THICKNESS,
            bevelEnabled: false
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // ExtrudeGeometry extrudes along Z. So (x, y) -> (x, y, z).
        // Wall face is X-Y plane. Thickness is Z.
        // We need to rotate this to stand up on the floor.
        // Floor is X-Z. Up is Y.
        // So we rotate geometry around X axis -90 deg?
        // Let's keep geometry as is and rotate mesh.

        const mesh = new THREE.Mesh(geometry, material);

        // Pivot adjustments
        // Default pivot is 0,0,0 of shape.
        // Wall start is at wall.start.
        // We need to rotate around Y to match wall angle.

        mesh.rotation.y = -angle;
        mesh.position.set(wall.start.x, 0, wall.start.y);

        // Wait, current shape is X=Length, Y=Height. Extrusion=Thickness (Z).
        // If we place it at 0,0,0 and rotate Y by -angle:
        // Local X aligns with world direction. Local Y is up. Local Z is thickness perpendicular.
        // BUT, wall thickness should be centered or offset?
        // Standard wall line is center.
        // So we need to offset the mesh by -Thickness/2 along Local Z.

        mesh.translateZ(-WALL_THICKNESS / 2);

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);

        // Add frames for openings? (Optional polish)
    }

    createStairsMesh(item) {
        // Simple straight stairs for now
        // U-turn is complex, let's just stack boxes
        const steps = 14;
        const stepHeight = 20; // 280cm total
        const stepDepth = 26;
        const totalHeight = 280;

        const material = new THREE.MeshLambertMaterial({ color: item.color });
        const group = new THREE.Group();

        // Assuming straight run for demo
        for (let i = 0; i < steps; i++) {
            const w = item.width;
            const geo = new THREE.BoxGeometry(w, stepHeight, stepDepth);
            const mesh = new THREE.Mesh(geo, material);
            // Stack them
            // Depending on rotation, "Forward" is -Z?
            // Local coordinates
            mesh.position.set(0, (i * stepHeight) + stepHeight / 2, -(i * stepDepth));
            group.add(mesh);
        }

        group.position.set(item.x, 0, item.y);
        group.rotation.y = -(item.rotation * Math.PI / 180);
        this.scene.add(group);
    }

    createFurnitureMesh(item) {
        let geometry;
        let material = new THREE.MeshLambertMaterial({ color: item.color });
        let yPos = 0;

        switch (item.type) {
            case 'bed':
                // Simple box
                geometry = new THREE.BoxGeometry(item.width, 50, item.depth);
                yPos = 25;
                break;
            case 'table':
                geometry = new THREE.BoxGeometry(item.width, 70, item.depth);
                yPos = 35;
                break;
            case 'sofa':
                geometry = new THREE.BoxGeometry(item.width, 80, item.depth);
                yPos = 40;
                break;
            default:
                geometry = new THREE.BoxGeometry(item.width, item.depth, item.depth);
                yPos = item.depth / 2;
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(item.x, yPos, item.y);
        mesh.rotation.y = - (item.rotation * Math.PI / 180);

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    resize() {
        if (!this.initialized) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
}

// --- Main App Controller ---
class App {
    constructor() {
        this.floorPlan = new FloorPlan();
        this.editor = new Editor2D(document.getElementById('canvas-2d'), this.floorPlan);
        this.viewer = new Viewer3D(document.getElementById('container-3d'), this.floorPlan);

        this.initUI();
    }

    async initUI() {
        // Load Projects
        try {
            const res = await fetch('projects.json');
            const projects = await res.json();
            const select = document.getElementById('project-select');

            projects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.file;
                opt.textContent = p.name;
                select.appendChild(opt);
            });

            // Allow selecting a project (auto load first for demo)
            if (projects.length > 0) {
                this.loadProject(projects[0].file);
            }

            select.addEventListener('change', (e) => {
                if (e.target.value) this.loadProject(e.target.value);
            });

        } catch (e) {
            console.error("Failed to load projects", e);
        }

        // Mode Switching
        document.getElementById('mode-2d').addEventListener('click', () => this.setMode('2d'));
        document.getElementById('mode-3d').addEventListener('click', () => this.setMode('3d'));

        // Tool Switching
        document.getElementById('tool-wall').addEventListener('click', () => {
            this.setActiveTool('wall');
            this.editor.setMode('wall');
        });

        document.getElementById('tool-select').addEventListener('click', () => {
            this.setActiveTool('select');
            this.editor.setMode('select');
        });

        document.getElementById('tool-delete').addEventListener('click', () => {
            this.editor.deleteSelected();
        });

        document.getElementById('btn-export').addEventListener('click', () => {
            this.exportProject();
        });

        // Furniture Buttons
        document.querySelectorAll('.furniture-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setActiveTool('furniture', btn);
                const type = btn.dataset.type;
                this.editor.setMode('furniture', type);
            });
        });
    }

    setActiveTool(tool, element = null) {
        // Reset active classes
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.furniture-item').forEach(b => b.classList.remove('active-furniture')); // Add this class to CSS if needed

        if (tool === 'wall') {
            document.getElementById('tool-wall').classList.add('active');
        } else if (tool === 'select') {
            document.getElementById('tool-select').classList.add('active');
        } else if (tool === 'delete') { // Visual feedback only usually
            // document.getElementById('tool-delete').classList.add('active');
        } else if (tool === 'furniture' && element) {
            // Optional: highlight selected furniture
            // element.classList.add('active-furniture'); 
        }
    }

    exportProject() {
        const data = JSON.stringify(this.floorPlan, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'floor_plan.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async loadProject(file) {
        try {
            const res = await fetch(file);
            const data = await res.json();
            this.floorPlan.load(data);
            this.editor.draw(); // Refresh 2D
        } catch (e) {
            console.error("Failed to load plan", e);
        }
    }

    setMode(mode) {
        // Toggle UI classes
        document.getElementById('mode-2d').classList.toggle('active', mode === '2d');
        document.getElementById('mode-3d').classList.toggle('active', mode === '3d');

        // Toggle Containers
        document.getElementById('container-2d').style.display = mode === '2d' ? 'block' : 'none';
        document.getElementById('container-3d').style.display = mode === '3d' ? 'block' : 'none';

        if (mode === '3d') {
            this.viewer.init();
            this.viewer.updateHelper(); // Generate 3D
            this.viewer.resize();
        }
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
