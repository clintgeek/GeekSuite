import React, { useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, useTheme, useMediaQuery, alpha } from '@mui/material';
import MindMapNode from '../MindMapNode';

const nodeTypes = {
    mindmap: MindMapNode,
};

const defaultViewport = { x: 0, y: 0, zoom: 1 };

const initialNode = {
    id: '0',
    type: 'mindmap',
    data: {
        label: 'Main Idea',
        isRoot: true
    },
    position: { x: 350, y: 250 },
    dragHandle: '.drag-handle'
};

function MindMapEditorInner({ content, setContent, readOnly }) {
    const containerRef = useRef(null);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [nodes, setNodes, onNodesChange] = useNodesState([initialNode]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const nextIdRef = useRef(1);
    const initialized = useRef(false);
    const lastContentRef = useRef(content);

    // Initialize or update from content
    useEffect(() => {
        // Skip if content is the same as before
        if (content === lastContentRef.current && initialized.current) {
            return;
        }

        lastContentRef.current = content;

        if (!initialized.current || content) {
            try {
                if (content) {
                    const data = JSON.parse(content);

                    if (data.nodes?.length > 0) {
                        // Update node callbacks only if not in readOnly mode
                        const nodesWithCallbacks = data.nodes.map(node => ({
                            ...node,
                            data: {
                                ...node.data,
                                ...(readOnly ? {} : {
                                    onDelete: () => handleNodeDelete(node.id),
                                    onEdit: (newLabel) => handleEditNode(node.id, newLabel),
                                    onAdd: () => handleAddChild(node.id)
                                })
                            }
                        }));
                        setNodes(nodesWithCallbacks);
                        setEdges(data.edges || []);

                        // Update the next ID based on the highest ID in the nodes
                        const maxId = Math.max(...data.nodes.map(n => {
                            const id = parseInt(n.id);
                            return isNaN(id) ? 0 : id;
                        }));
                        nextIdRef.current = maxId + 1;
                    } else {
                        initializeEmptyMap();
                    }
                } else {
                    initializeEmptyMap();
                }
                initialized.current = true;
            } catch (e) {
                console.error('MindMapEditor - Failed to parse:', e);
                initializeEmptyMap();
            }
        }
    }, [content, readOnly, setNodes, setEdges]);

    // Update content when nodes/edges change
    useEffect(() => {
        if (!initialized.current) return;

        const timer = setTimeout(() => {
            try {
                const newContent = JSON.stringify({
                    nodes: nodes.map(({ data, ...rest }) => ({
                        ...rest,
                        data: {
                            label: data.label,
                            isRoot: data.isRoot
                        }
                    })),
                    edges
                });

                // Only update if content has actually changed
                if (newContent !== lastContentRef.current) {
                    setContent(newContent);
                    lastContentRef.current = newContent;
                }
            } catch (err) {
                console.error("MindMapEditor - Error serializing:", err);
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [nodes, edges, setContent]);

    const initializeEmptyMap = () => {
        const rootNode = {
            ...initialNode,
            data: {
                ...initialNode.data,
                onEdit: readOnly ? undefined : (newLabel) => handleEditNode('0', newLabel),
                onAdd: readOnly ? undefined : () => handleAddChild('0')
            }
        };
        setNodes([rootNode]);
        setEdges([]);
        nextIdRef.current = 1;
    };

    // Handle inline edit - receives new label directly from MindMapNode
    const handleEditNode = useCallback((id, newLabel) => {
        if (readOnly) return;
        if (!newLabel || typeof newLabel !== 'string') return;

        setNodes(nds => nds.map(node => {
            if (node.id === id) {
                return {
                    ...node,
                    data: {
                        ...node.data,
                        label: newLabel
                    }
                };
            }
            return node;
        }));
    }, [readOnly, setNodes]);

    const handleAddChild = (parentId) => {
        if (readOnly) return;

        const parentNode = nodes.find(n => n.id === parentId);
        if (!parentNode) return;

        const newNodeId = nextIdRef.current.toString();
        nextIdRef.current += 1;

        const parentOutgoers = nodes.filter(n =>
            edges.some(e => e.source === parentId && e.target === n.id)
        );
        const yOffset = parentOutgoers.length * 80;

        const newNode = {
            id: newNodeId,
            type: 'mindmap',
            data: {
                label: 'New Node',
                onDelete: () => handleNodeDelete(newNodeId),
                onEdit: (newLabel) => handleEditNode(newNodeId, newLabel),
                onAdd: () => handleAddChild(newNodeId),
            },
            position: {
                x: parentNode.position.x + 200,
                y: parentNode.position.y + yOffset - 100,
            },
            dragHandle: '.drag-handle'
        };

        const newEdge = {
            id: `e${parentId}-${newNodeId}`,
            source: parentId,
            target: newNodeId,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#2196f3' }
        };

        setNodes(nds => [...nds, newNode]);
        setEdges(eds => [...eds, newEdge]);
    };

    const handleNodeDelete = useCallback((nodeId) => {
        if (readOnly) return;
        setNodes(nds => nds.filter(node => node.id !== nodeId));
        setEdges(eds => eds.filter(edge =>
            edge.source !== nodeId && edge.target !== nodeId
        ));
    }, [setNodes, setEdges, readOnly]);

    const onConnect = useCallback((params) => {
        if (readOnly) return;
        setEdges((eds) => addEdge({ ...params, type: 'smoothstep', animated: false }, eds));
    }, [setEdges, readOnly]);

    const handleNodesChange = useCallback((changes) => {
        onNodesChange(changes);
    }, [onNodesChange]);

    // Force update nodes when readOnly changes to update action buttons
    useEffect(() => {
        if (initialized.current) {
            setNodes(nodes => nodes.map(node => {
                // Important - capture the current node ID in the closure
                const nodeId = node.id;
                return {
                    ...node,
                    data: {
                        ...node.data,
                        ...(readOnly ? {
                            // Remove all callbacks in readOnly mode
                            onDelete: undefined,
                            onEdit: undefined,
                            onAdd: undefined
                        } : {
                            // Add callbacks in edit mode, using captured nodeId
                            onDelete: node.data.isRoot ? undefined : () => handleNodeDelete(nodeId),
                            onEdit: (newLabel) => handleEditNode(nodeId, newLabel),
                            onAdd: () => handleAddChild(nodeId)
                        })
                    }
                };
            }));
        }
    }, [readOnly, setNodes]);

    return (
        <Box
            ref={containerRef}
            sx={{
                width: '100%',
                height: '100%',
                bgcolor: theme.palette.mode === 'light' ? '#FAFAFA' : theme.palette.background.default,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                position: 'absolute',
                inset: 0,
                // Custom ReactFlow styling
                '& .react-flow__controls': {
                    bgcolor: alpha(theme.palette.background.paper, 0.9),
                    backdropFilter: 'blur(8px)',
                    borderRadius: 2,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.3),
                    overflow: 'hidden',
                    // Position differently on mobile
                    ...(isMobile && {
                        bottom: 16,
                        left: 16,
                    }),
                },
                '& .react-flow__controls-button': {
                    bgcolor: 'transparent',
                    borderColor: alpha(theme.palette.divider, 0.3),
                    '&:hover': {
                        bgcolor: alpha(theme.palette.primary.main, 0.1),
                    },
                },
                '& .react-flow__minimap': {
                    bgcolor: alpha(theme.palette.background.paper, 0.9),
                    backdropFilter: 'blur(8px)',
                    borderRadius: 2,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    border: '1px solid',
                    borderColor: alpha(theme.palette.divider, 0.3),
                    overflow: 'hidden',
                },
            }}
        >
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={handleNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
                defaultViewport={defaultViewport}
                proOptions={{ hideAttribution: true }}
                deleteKeyCode="Delete"
                selectionKeyCode="Shift"
                multiSelectionKeyCode="Control"
                zoomActivationKeyCode="Control"
                nodesDraggable={!readOnly}
                nodesConnectable={!readOnly}
                edgesUpdatable={!readOnly}
                elementsSelectable={true}
                snapToGrid={true}
                snapGrid={[15, 15]}
                style={{ width: '100%', height: '100%' }}
                // Better touch handling
                panOnDrag={isMobile ? [1, 2] : true}
                panOnScroll={!isMobile}
                zoomOnScroll={!isMobile}
                zoomOnPinch={true}
                zoomOnDoubleClick={!isMobile}
            >
                <Background 
                    variant="dots" 
                    gap={12} 
                    size={1} 
                    color={alpha(theme.palette.text.primary, 0.08)}
                />
                <Controls 
                    showInteractive={!isMobile}
                    position={isMobile ? 'bottom-left' : 'bottom-left'}
                />
                {/* Hide MiniMap on mobile - it's too small to be useful */}
                {!isMobile && (
                    <MiniMap 
                        nodeColor={(node) => node.data?.isRoot ? '#5B50A8' : '#3D8493'}
                        maskColor={alpha(theme.palette.background.paper, 0.7)}
                    />
                )}
            </ReactFlow>
        </Box>
    );
}

function MindMapEditor(props) {
    return (
        <ReactFlowProvider>
            <Box sx={{
                width: '100%',
                height: '100%',
                flex: 1,
                display: 'flex',
                position: 'relative',
                // Remove fixed minHeight - let flex parent control sizing
            }}>
                <MindMapEditorInner {...props} />
            </Box>
        </ReactFlowProvider>
    );
}

export default MindMapEditor;