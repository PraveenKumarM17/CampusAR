using UnityEngine;

namespace CampusAR.Indoor
{
    /// <summary>
    /// User indoor AR guidance after QR relocalization.
    /// Uses saved graph waypoints in the local map frame, not GPS.
    /// Arrival uses proximity, not exact pose match.
    /// </summary>
    public class IndoorGuidanceController : MonoBehaviour
    {
        [SerializeField] Transform arrow;
        [SerializeField] float arriveMeters = 1.8f;

        IndoorRouteStepDto[] steps;
        int index;
        Transform origin;

        public string HudInstruction { get; private set; } = "Scan a CampusAR indoor marker.";
        public string HudDistance { get; private set; } = "";
        public bool Arrived { get; private set; }

        public void Begin(IndoorRouteStepDto[] routeSteps, Transform qrOrigin)
        {
            steps = routeSteps;
            index = 0;
            origin = qrOrigin;
            Arrived = false;
            HudInstruction = steps != null && steps.Length > 0 ? steps[0].instruction : "No route";
        }

        void Update()
        {
            if (Arrived || steps == null || origin == null || Camera.main == null) return;
            if (index >= steps.Length)
            {
                Arrived = true;
                HudInstruction = "You have arrived";
                HudDistance = "";
                return;
            }

            var step = steps[index];
            var world = origin.TransformPoint(new Vector3(step.localX, step.localY, step.localZ));
            var cam = Camera.main.transform.position;
            var planar = Vector3.ProjectOnPlane(world - cam, Vector3.up);
            var dist = planar.magnitude;
            HudDistance = $"{dist:0.0} m";
            HudInstruction = step.instruction ?? "Walk";

            if (arrow != null && planar.sqrMagnitude > 0.0001f)
            {
                var look = Quaternion.LookRotation(planar.normalized, Vector3.up);
                arrow.rotation = Quaternion.Slerp(arrow.rotation, look, Time.deltaTime * 8f);
            }

            if (dist <= arriveMeters)
            {
                index++;
                if (index >= steps.Length)
                {
                    Arrived = true;
                    HudInstruction = "You have arrived";
                }
            }
        }
    }
}
