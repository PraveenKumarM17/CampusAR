package com.campusarmobile.measure

import android.content.Context
import android.opengl.GLES20
import android.opengl.GLSurfaceView
import android.util.AttributeSet
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.events.RCTEventEmitter
import com.google.ar.core.Anchor
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Frame
import com.google.ar.core.HitResult
import com.google.ar.core.Plane
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.CameraNotAvailableException
import java.util.UUID
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10
import kotlin.math.sqrt

class CampusARMeasureView @JvmOverloads constructor(
  context: Context,
  attrs: AttributeSet? = null,
) : FrameLayout(context, attrs), GLSurfaceView.Renderer {

  private val glSurfaceView = GLSurfaceView(context)
  private var session: Session? = null
  private var installRequested = false
  private val anchors = mutableListOf<Anchor>()
  private val pointIds = mutableListOf<String>()
  private var lastTracking = "initializing"
  private var lastSurface = false
  private var viewportWidth = 1
  private var viewportHeight = 1
  private val backgroundRenderer = BackgroundRenderer()
  private var backgroundReady = false

  init {
    glSurfaceView.setEGLContextClientVersion(2)
    glSurfaceView.setRenderer(this)
    glSurfaceView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
    addView(
      glSurfaceView,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT),
    )
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    CampusARMeasureRegistry.activeView = this
  }

  override fun onDetachedFromWindow() {
    if (CampusARMeasureRegistry.activeView === this) {
      CampusARMeasureRegistry.activeView = null
    }
    session?.pause()
    super.onDetachedFromWindow()
  }

  fun startSession() {
    post {
      val activity = (context as? ReactContext)?.currentActivity
      if (activity == null) {
        emitError("Cannot start AR without an active Activity.")
        return@post
      }
      when (ArCoreApk.getInstance().requestInstall(activity, !installRequested)) {
        ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
          installRequested = true
          emitError("Install Google Play Services for AR, then reopen measurement.")
        }
        ArCoreApk.InstallStatus.INSTALLED -> createSession()
      }
    }
  }

  private fun createSession() {
    try {
      if (session == null) {
        session = Session(context)
      }
      val config = Config(session)
      config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL
      config.updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
      session?.configure(config)
      session?.resume()
      glSurfaceView.onResume()
      emitTracking("initializing", null)
    } catch (ex: Exception) {
      emitError(ex.message ?: "Failed to start ARCore session")
      emitTracking("unavailable", "session_error")
    }
  }

  fun pauseSession() {
    session?.pause()
    glSurfaceView.onPause()
  }

  fun resumeSession() {
    createSession()
  }

  fun resetSession() {
    clearPoints()
    session?.close()
    session = null
    createSession()
  }

  fun placePointAtCenter(): WritableMap? {
    val frame = session?.update() ?: return null
    if (frame.camera.trackingState != TrackingState.TRACKING) {
      emitSurface(false)
      return null
    }
    val hits = frame.hitTest(viewportWidth / 2f, viewportHeight / 2f)
    val hit = hits.firstOrNull { h ->
      val trackable = h.trackable
      trackable is Plane && trackable.isPoseInPolygon(h.hitPose)
    } ?: hits.firstOrNull()
    if (hit == null) {
      emitSurface(false)
      return null
    }
    emitSurface(true)
    val anchor = hit.createAnchor()
    anchors.add(anchor)
    val id = UUID.randomUUID().toString()
    pointIds.add(id)
    val t = anchor.pose.translation
    emitPoints()
    return Arguments.createMap().apply {
      putString("id", id)
      putDouble("x", t[0].toDouble())
      putDouble("y", t[1].toDouble())
      putDouble("z", t[2].toDouble())
    }
  }

  fun undoLastPoint() {
    if (anchors.isEmpty()) return
    anchors.removeAt(anchors.lastIndex).detach()
    pointIds.removeAt(pointIds.lastIndex)
    emitPoints()
  }

  fun clearPoints() {
    anchors.forEach { it.detach() }
    anchors.clear()
    pointIds.clear()
    emitPoints()
  }

  fun currentTrackingState(): WritableMap =
    Arguments.createMap().apply { putString("quality", lastTracking) }

  override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
    GLES20.glClearColor(0f, 0f, 0f, 1f)
    backgroundRenderer.createOnGlThread(context)
    backgroundReady = true
  }

  override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
    viewportWidth = width
    viewportHeight = height
    GLES20.glViewport(0, 0, width, height)
    session?.setDisplayGeometry(display.rotation, width, height)
  }

  override fun onDrawFrame(gl: GL10?) {
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
    val currentSession = session ?: return
    try {
      if (backgroundReady) {
        currentSession.setCameraTextureName(backgroundRenderer.getTextureId())
      }
      val frame = currentSession.update()
      if (backgroundReady) {
        backgroundRenderer.draw(frame)
      }
      trackCamera(frame)
    } catch (_: CameraNotAvailableException) {
      emitTracking("interrupted", "camera_unavailable")
    }
  }

  private fun trackCamera(frame: Frame) {
    val state = frame.camera.trackingState
    val quality = when (state) {
      TrackingState.TRACKING -> "normal"
      TrackingState.PAUSED -> "limited"
      TrackingState.STOPPED -> "unavailable"
      else -> "limited"
    }
    if (quality != lastTracking) {
      lastTracking = quality
      emitTracking(quality, state.name.lowercase())
    }
    val planeDetected = frame.getUpdatedTrackables(Plane::class.java).any { it.trackingState == TrackingState.TRACKING }
    emitSurface(planeDetected)
  }

  private fun emitPoints() {
    val pointsArray = Arguments.createArray()
    for (i in anchors.indices) {
      val t = anchors[i].pose.translation
      val map = Arguments.createMap()
      map.putString("id", pointIds[i])
      map.putDouble("x", t[0].toDouble())
      map.putDouble("y", t[1].toDouble())
      map.putDouble("z", t[2].toDouble())
      pointsArray.pushMap(map)
    }
    var segment: Double? = null
    if (anchors.size >= 2) {
      val a = anchors[anchors.size - 2].pose.translation
      val b = anchors[anchors.size - 1].pose.translation
      segment = distance(a, b)
    }
    var total = 0.0
    for (i in 1 until anchors.size) {
      total += distance(anchors[i - 1].pose.translation, anchors[i].pose.translation)
    }
    emitEvent(
      Arguments.createMap().apply {
        putString("type", "points")
        putArray("points", pointsArray)
        if (segment != null) putDouble("segmentDistanceM", segment) else putNull("segmentDistanceM")
        putDouble("totalDistanceM", total)
      },
    )
  }

  private fun distance(a: FloatArray, b: FloatArray): Double {
    val dx = (b[0] - a[0]).toDouble()
    val dy = (b[1] - a[1]).toDouble()
    val dz = (b[2] - a[2]).toDouble()
    return sqrt(dx * dx + dy * dy + dz * dz)
  }

  private fun emitTracking(quality: String, reason: String?) {
    emitEvent(
      Arguments.createMap().apply {
        putString("type", "tracking")
        putString("quality", quality)
        if (reason != null) putString("reason", reason)
      },
    )
  }

  private fun emitSurface(detected: Boolean) {
    if (detected == lastSurface) return
    lastSurface = detected
    emitEvent(
      Arguments.createMap().apply {
        putString("type", "surface")
        putBoolean("detected", detected)
      },
    )
  }

  private fun emitError(message: String) {
    emitEvent(
      Arguments.createMap().apply {
        putString("type", "error")
        putString("message", message)
      },
    )
  }

  private fun emitEvent(payload: WritableMap) {
    val reactContext = context as? ReactContext ?: return
    reactContext
      .getJSModule(RCTEventEmitter::class.java)
      .receiveEvent(id, "onMeasureEvent", payload)
  }
}
