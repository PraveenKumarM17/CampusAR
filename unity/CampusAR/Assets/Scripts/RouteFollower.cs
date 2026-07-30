using UnityEngine;

namespace CampusAR
{
    public class RouteFollower : MonoBehaviour
    {
        [SerializeField] private ApiClient apiClient;
        [SerializeField] private ArrowGuide arrowGuide;
        [SerializeField] private VoiceGuide voiceGuide;
        [SerializeField] private DestinationMarker destinationMarker;
        [SerializeField] private string sourceNodeId = "a1000001-0000-0000-0000-000000000001";
        [SerializeField] private string destinationNodeId = "a1000001-0000-0000-0000-000000000014";

        private RouteResponse _route;
        private int _step;

        private void Start()
        {
            StartCoroutine(apiClient.GuestLogin("Unity Guest", _ =>
            {
                StartCoroutine(apiClient.GetRoute(sourceNodeId, destinationNodeId, OnRoute, Debug.LogError));
            }, Debug.LogError));
        }

        private void OnRoute(RouteResponse route)
        {
            _route = route;
            _step = 0;
            ApplyStep();
            if (route.path != null && route.path.Length > 0)
            {
                var last = route.path[route.path.Length - 1];
                destinationMarker.SetDestination(last.latitude, last.longitude);
            }
        }

        private void Update()
        {
            // Demo: advance every 5s. Replace with pose-based proximity later.
            if (_route == null || _route.path == null || _route.path.Length == 0) return;
            if (Time.frameCount % 300 == 0)
            {
                _step = Mathf.Min(_step + 1, _route.path.Length - 1);
                ApplyStep();
            }
        }

        private void ApplyStep()
        {
            var step = _route.path[_step];
            arrowGuide.SetBearing(step.bearing);
            voiceGuide.Speak(step.instruction);
        }
    }
}
