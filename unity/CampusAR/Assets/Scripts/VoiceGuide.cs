using UnityEngine;

namespace CampusAR
{
    public class VoiceGuide : MonoBehaviour
    {
        public void Speak(string instruction)
        {
            // Hook platform TTS (Android TextToSpeech / iOS AVSpeech) in production builds.
            Debug.Log($"[CampusAR Voice] {instruction}");
        }
    }
}
