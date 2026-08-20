using System;
using System.Collections.Generic;
using UnityEngine;

namespace CampusAR.Indoor
{
    [Serializable]
    public class LocalNode
    {
        public string id;
        public string floorId;
        public Vector3 local;
        public string kind = "corridor";
        public string name;
        public GameObject marker;
    }

    [Serializable]
    public class LocalEdge
    {
        public string id;
        public string fromId;
        public string toId;
        public string kind = "walk";
        public LineRenderer line;
    }

    /// <summary>
    /// In-memory graph editor: add/select/connect/undo. Points are created only on explicit Add.
    /// Arbitrary connections are allowed (not a linear measurement chain).
    /// </summary>
    public class IndoorGraphEditor : MonoBehaviour
    {
        public readonly List<LocalNode> Nodes = new();
        public readonly List<LocalEdge> Edges = new();
        public string SelectedId { get; private set; }

        readonly Stack<Action> undo = new();
        readonly Stack<Action> redo = new();

        [SerializeField] float snapMeters = 0.45f;
        [SerializeField] GameObject nodePrefab;
        [SerializeField] Material edgeMaterial;

        public LocalNode AddPoint(Vector3 world, string floorId, string kind, string name, bool snap)
        {
            if (snap)
            {
                var existing = FindNearby(world, snapMeters);
                if (existing != null)
                {
                    SelectedId = existing.id;
                    return existing;
                }
            }

            var node = new LocalNode
            {
                id = Guid.NewGuid().ToString(),
                floorId = floorId,
                local = world,
                kind = kind,
                name = name,
                marker = nodePrefab ? Instantiate(nodePrefab, world, Quaternion.identity) : GameObject.CreatePrimitive(PrimitiveType.Sphere)
            };
            node.marker.transform.position = world;
            node.marker.transform.localScale = Vector3.one * 0.08f;
            Nodes.Add(node);
            SelectedId = node.id;
            PushUndo(() => RemoveNodeLocal(node.id));
            return node;
        }

        public void Select(string id) => SelectedId = id;

        public void ConnectSelectedTo(string otherId, string kind = "walk")
        {
            if (string.IsNullOrEmpty(SelectedId) || SelectedId == otherId) return;
            if (Edges.Exists(e => (e.fromId == SelectedId && e.toId == otherId) || (e.fromId == otherId && e.toId == SelectedId)))
                return;
            var from = Nodes.Find(n => n.id == SelectedId);
            var to = Nodes.Find(n => n.id == otherId);
            if (from == null || to == null) return;
            var edge = new LocalEdge { id = Guid.NewGuid().ToString(), fromId = from.id, toId = to.id, kind = kind };
            edge.line = CreateLine(from.local, to.local);
            Edges.Add(edge);
            var edgeId = edge.id;
            PushUndo(() => RemoveEdgeLocal(edgeId));
        }

        public void Disconnect(string edgeId)
        {
            var e = Edges.Find(x => x.id == edgeId);
            if (e == null) return;
            RemoveEdgeLocal(edgeId);
        }

        public void DeleteSelected()
        {
            if (string.IsNullOrEmpty(SelectedId)) return;
            RemoveNodeLocal(SelectedId);
            SelectedId = null;
        }

        public void Undo() { if (undo.Count > 0) undo.Pop().Invoke(); }
        public void Redo() { if (redo.Count > 0) redo.Pop().Invoke(); }

        public LocalNode FindNearby(Vector3 world, float threshold)
        {
            LocalNode best = null;
            var bestD = threshold;
            foreach (var n in Nodes)
            {
                var d = Vector3.Distance(world, n.local);
                if (d <= bestD) { best = n; bestD = d; }
            }
            return best;
        }

        LineRenderer CreateLine(Vector3 a, Vector3 b)
        {
            var go = new GameObject("IndoorEdge");
            var lr = go.AddComponent<LineRenderer>();
            lr.positionCount = 2;
            lr.SetPosition(0, a);
            lr.SetPosition(1, b);
            lr.startWidth = 0.03f;
            lr.endWidth = 0.03f;
            if (edgeMaterial) lr.material = edgeMaterial;
            return lr;
        }

        void RemoveNodeLocal(string id)
        {
            var node = Nodes.Find(n => n.id == id);
            if (node == null) return;
            var related = Edges.FindAll(e => e.fromId == id || e.toId == id);
            foreach (var e in related) RemoveEdgeLocal(e.id);
            if (node.marker) Destroy(node.marker);
            Nodes.Remove(node);
        }

        void RemoveEdgeLocal(string id)
        {
            var e = Edges.Find(x => x.id == id);
            if (e == null) return;
            if (e.line) Destroy(e.line.gameObject);
            Edges.Remove(e);
        }

        void PushUndo(Action action)
        {
            undo.Push(action);
            redo.Clear();
        }

        void OnDestroy()
        {
            foreach (var n in Nodes) if (n.marker) Destroy(n.marker);
            foreach (var e in Edges) if (e.line) Destroy(e.line.gameObject);
        }
    }
}
