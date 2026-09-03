using UnityEngine;

namespace CampusAR
{
    public class ArrowGuide : MonoBehaviour
    {
        [SerializeField] private Transform arrow;

        [Header("Arrow smoothing")]
        [SerializeField] private float rotationSmoothSpeed = 8f;

        private float targetRelativeBearing;
        private float currentRelativeBearing;

        public void SetRelativeBearing(float relativeBearing)
        {
            targetRelativeBearing = Normalize180(relativeBearing);
        }

        private void Update()
        {
            if (arrow == null) return;

            currentRelativeBearing = Mathf.LerpAngle(
                currentRelativeBearing,
                targetRelativeBearing,
                rotationSmoothSpeed * Time.deltaTime
            );

            // 0 = straight ahead
            // negative = left
            // positive = right
            arrow.localRotation = Quaternion.Euler(
                0f,
                currentRelativeBearing,
                0f
            );
        }

        private static float Normalize180(float angle)
        {
            angle %= 360f;

            if (angle > 180f)
                angle -= 360f;

            if (angle < -180f)
                angle += 360f;

            return angle;
        }
    }
}
