using UnityEngine;
using UnityEngine.XR.ARFoundation;

namespace CampusAR.Indoor
{
    /// <summary>
    /// Admin indoor mapper. Mapping is blocked when AR tracking is poor.
    /// Points are created only when Add Point is pressed.
    /// </summary>
    public class IndoorMapperController : MonoBehaviour
    {
        [SerializeField] ARSession arSession;
        [SerializeField] ARPlaneManager planeManager;
        [SerializeField] ARReticle reticle;
        [SerializeField] IndoorGraphEditor editor;
        [SerializeField] IndoorApiClient api;

        [Header("Session")]
        public string buildingId;
        public string floorId;
        public string mapId;
        public string lastKind = "corridor";

        public string TrackingQuality { get; private set; } = "unknown";
        public bool CanMap { get; private set; }
        public string Status { get; private set; } = "Select building and floor, then Start mapping.";

        void Update()
        {
            var state = ARSession.state;
            TrackingQuality = state.ToString();
            var planes = planeManager != null ? planeManager.trackables.count : 0;
            CanMap = state == ARSessionState.SessionTracking && planes > 0 && reticle != null && reticle.HasHit;
            if (state != ARSessionState.SessionTracking)
                Status = "Tracking poor — walk slowly until the reticle appears.";
            else if (planes == 0)
                Status = "No floor plane yet — pan the camera across the ground.";
            else if (!reticle.HasHit)
                Status = "Aim the reticle at the floor.";
            else
                Status = "Ready. Add Point places one node. Connect to branch the graph.";
        }

        public void AddPoint()
        {
            if (!CanMap)
            {
                Status = "Cannot add a point until tracking and a plane are stable.";
                return;
            }
            editor.AddPoint(reticle.HitPose.position, floorId, lastKind, lastKind, snap: true);
        }

        public void MarkKind(string kind) => lastKind = kind;

        public void ConnectToNearest()
        {
            if (string.IsNullOrEmpty(editor.SelectedId) || !reticle.HasHit) return;
            var near = editor.FindNearby(reticle.HitPose.position, 0.45f);
            if (near != null && near.id != editor.SelectedId)
                editor.ConnectSelectedTo(near.id, EdgeKindFor(lastKind));
        }

        static string EdgeKindFor(string nodeKind)
        {
            if (nodeKind == "stairs") return "stairs";
            if (nodeKind == "elevator") return "elevator";
            if (nodeKind == "ramp") return "ramp";
            return "walk";
        }

        void OnDisable()
        {
            if (planeManager != null) planeManager.enabled = false;
        }
    }
}
