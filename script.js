import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Configuration Constants ---
const GRID_SIZE = 20; // cm pixels
const WALL_THICKNESS = 10;
const WALL_HEIGHT = 240; // cm

// --- Data Models ---
class FloorPlan {
    constructor() {
        this.walls = [];
        this.furniture = [];
    }

    load(data) {
        this.walls = data.walls || [];
        this.furniture = data.furniture || [];
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
        this.drawFurniture();

        // Draw temporary wall if drawing
        if (this.isDrawing && this.startPoint) {
            this.drawTempWall();
        }

        // Draw ghost furniture if in furniture mode
        if (this.currentMod === 'furniture' && this.activeFurnitureType) {
            this.drawGhostFurniture();
        }

        this.ctx.restore();
    }

    getFurnitureDims(type) {
        // Hardcoded sizes for demo
        switch (type) {
            case 'bed': return { width: 100, depth: 200, color: '#3366cc' };
            case 'table': return { width: 120, depth: 80, color: '#8b4513' };
            case 'sofa': return { width: 200, depth: 90, color: '#555555' };
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
        } else if (this.currentMod === 'select') {
            // Check furniture selection (simple hit test)
            // Note: rotation makes hit test harder, approximating with bounding circle for now for speed
            // Or just direct box check if rotation is 0
            // ... Logic for selection
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

        if (this.isDrawing || this.currentMod === 'furniture') {
            this.draw(); // Redraw for temp wall or ghost furniture
        }
    }

    handleMouseUp(e) {
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
            if (child.isMesh) {
                toRemove.push(child);
            }
        });
        toRemove.forEach(obj => this.scene.remove(obj));

        // Create Walls
        // Use a group for walls
        const wallMaterial = new THREE.MeshLambertMaterial({ color: 0xdddddd });
        const wallGroup = new THREE.Group();

        this.floorPlan.walls.forEach(wall => {
            this.createWallMesh(wall, wallGroup, wallMaterial);
        });
        this.scene.add(wallGroup);

        // Create Furniture
        this.floorPlan.furniture.forEach(item => {
            this.createFurnitureMesh(item);
        });
    }

    createWallMesh(wall, group, material) {
        const dx = wall.end.x - wall.start.x;
        const dy = wall.end.y - wall.start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const cx = (wall.start.x + wall.end.x) / 2;
        const cy = (wall.start.y + wall.end.y) / 2; // In 2D Y is down, usually? standard cartesian?
        // In our canvas, usually Y increases downwards, but let's assume standard math for now
        // Actually canvas and 3D coordinate mapping needs care.
        // Let's map 2D (x, y) to 3D (x, 0, z) or (x, y, 0).
        // Standard floor plan: X, Y on ground. Z is height.
        // Canvas: X right, Y down.
        // ThreeJS: X right, Y up, Z towards viewer (or usually Y is up for 3D world).
        // Let's map Canvas X -> 3D X, Canvas Y -> 3D Z.

        const geometry = new THREE.BoxGeometry(len + WALL_THICKNESS, WALL_HEIGHT, WALL_THICKNESS);
        const mesh = new THREE.Mesh(geometry, material);

        // Position
        mesh.position.set(cx, WALL_HEIGHT / 2, cy);

        // Rotation (around Y axis)
        // Canvas Y is "down" (positive), 3D Z is "back" (positive).
        // Math.atan2(dy, dx) gives angle from X axis.
        // If we map Y -> Z, then rotation is around Y axis.
        // Angle needs to be negated because Z grows "down" in screen space effectively?
        // Let's try standard angle first.
        mesh.rotation.y = -angle; // Counter-clockwise in 2D to clockwise in 3D Y-up?

        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        // Add "posts" at ends to fill gaps? 
        // For simple Viewer, just overlapping boxes is fine, or simple cylinders at corners.
        // Let's add cylinders at start/end 
        const cylGeo = new THREE.CylinderGeometry(WALL_THICKNESS / 2, WALL_THICKNESS / 2, WALL_HEIGHT, 16);
        const startPost = new THREE.Mesh(cylGeo, material);
        startPost.position.set(wall.start.x, WALL_HEIGHT / 2, wall.start.y);
        startPost.castShadow = true;
        group.add(startPost);

        const endPost = new THREE.Mesh(cylGeo, material);
        endPost.position.set(wall.end.x, WALL_HEIGHT / 2, wall.end.y);
        endPost.castShadow = true;
        group.add(endPost);
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
        } else if (tool === 'furniture' && element) {
            // Optional: highlight selected furniture
            // element.classList.add('active-furniture'); 
        }
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
