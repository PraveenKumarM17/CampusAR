using UnityEngine;

namespace CampusAR
{
    public class RouteFollower : MonoBehaviour
    {
        [SerializeField] private ApiClient apiClient;
        [SerializeField] private ArrowGuide arrowGuide;
        [SerializeField] private VoiceGuide voiceGuide;
        [SerializeField] private DestinationMarker destinationMarker;

        [SerializeField] private string sourceNodeId =
            "a1000001-0000-0000-0000-000000000001";

        [SerializeField] private string destinationNodeId =
            "a1000001-0000-0000-0000-000000000014";

        [Header("Compass")]
        [SerializeField] private float compassSmoothing = 8f;

        private RouteResponse _route;
        private int _step;

        private float _heading;
        private bool _compassReady;

        private void Start()
        {
            StartCoroutine(StartSensors());

            StartCoroutine(
                apiClient.GuestLogin(
                    "Unity Guest",
                    _ =>
                    {
                        StartCoroutine(
                            apiClient.GetRoute(
                                sourceNodeId,
                                destinationNodeId,
                                OnRoute,
                                Debug.LogError
                            )
                        );
                    },
                    Debug.LogError
                )
            );
        }

        private System.Collections.IEnumerator StartSensors()
        {
            if (!Input.location.isEnabledByUser)
            {
                Debug.LogWarning("Location services are disabled.");
            }
            else
            {
                Input.location.Start(
                    1f,
                    1f
                );

                int wait = 20;

                while (
                    Input.location.status ==
                        LocationServiceStatus.Initializing &&
                    wait > 0
                )
                {
                    yield return new WaitForSeconds(1f);
                    wait--;
                }
            }

            Input.compass.enabled = true;

            yield return null;

            _heading = Input.compass.trueHeading;

            if (_heading <= 0f)
                _heading = Input.compass.magneticHeading;

            _compassReady = true;
        }

        private void OnRoute(RouteResponse route)
        {
            _route = route;
            _step = 0;

            ApplyStep();

            if (
                route.path != null &&
                route.path.Length > 0
            )
            {
                var last =
                    route.path[route.path.Length - 1];

                destinationMarker.SetDestination(
                    last.latitude,
                    last.longitude
                );
            }
        }

        private void Update()
        {
            UpdateCompass();

            if (
                _route == null ||
                _route.path == null ||
                _route.path.Length == 0
            )
            {
                return;
            }

            UpdateArrow();

            // Temporary demo progression.
            // Replace this with GPS waypoint proximity.
            if (Time.frameCount % 300 == 0)
            {
                _step = Mathf.Min(
                    _step + 1,
                    _route.path.Length - 1
                );

                ApplyStep();
            }
        }

        private void UpdateCompass()
        {
            if (!_compassReady)
                return;

            float heading =
                Input.compass.trueHeading;

            if (heading <= 0f)
            {
                heading =
                    Input.compass.magneticHeading;
            }

            _heading = Mathf.LerpAngle(
                _heading,
                heading,
                compassSmoothing * Time.deltaTime
            );

            _heading = Normalize360(_heading);
        }

        private void UpdateArrow()
{
    if (
        arrowGuide == null ||
        _route == null ||
        _route.path == null ||
        _route.path.Length == 0 ||
        _step >= _route.path.Length
    )
    {
        return;
    }

    RouteStep current = _route.path[_step];

    float targetBearing = current.bearing;

    // Phone's current compass heading → route's absolute bearing
    float relativeBearing = Mathf.DeltaAngle(
        _heading,
        targetBearing
    );

    arrowGuide.SetRelativeBearing(relativeBearing);

    Debug.Log(
        $"Heading: {_heading:F1}° | " +
        $"Target: {targetBearing:F1}° | " +
        $"Arrow: {relativeBearing:F1}°"
    );
}

        private void ApplyStep()
        {
            if (
                _route == null ||
                _route.path == null ||
                _route.path.Length == 0
            )
            {
                return;
            }

            RouteStep step =
                _route.path[_step];

            if (voiceGuide != null)
            {
                voiceGuide.Speak(
                    step.instruction
                );
            }

            UpdateArrow();
        }

        private static float Normalize360(float angle)
        {
            angle %= 360f;

            if (angle < 0f)
                angle += 360f;

            return angle;
        }
    }
}
private string GetDirectionLabel(float relativeBearing)
{
    if (Mathf.Abs(relativeBearing) < 20f)
        return "Continue straight";

    if (relativeBearing >= 20f &&
        relativeBearing < 55f)
        return "Slight right";

    if (relativeBearing >= 55f &&
        relativeBearing < 125f)
        return "Turn right";

    if (relativeBearing >= 125f)
        return "Make a U-turn";

    if (relativeBearing <= -20f &&
        relativeBearing > -55f)
        return "Slight left";

    if (relativeBearing <= -55f &&
        relativeBearing > -125f)
        return "Turn left";

    return "Make a U-turn";
}