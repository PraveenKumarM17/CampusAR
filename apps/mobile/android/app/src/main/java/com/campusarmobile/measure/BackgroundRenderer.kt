package com.campusarmobile.measure

import android.content.Context
import android.opengl.GLES11Ext
import android.opengl.GLES20
import com.google.ar.core.Frame
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/** Minimal ARCore camera background renderer (adapted from Google ARCore samples). */
class BackgroundRenderer {
  private var quadCoords: FloatBuffer? = null
  private var quadTexCoords: FloatBuffer? = null
  private var program = 0
  private var textureId = -1

  fun createOnGlThread(context: Context) {
    val coords = floatArrayOf(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)
    quadCoords = ByteBuffer.allocateDirect(coords.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
    quadCoords?.put(coords)?.position(0)
    val tex = floatArrayOf(0f, 1f, 1f, 1f, 0f, 0f, 1f, 0f)
    quadTexCoords = ByteBuffer.allocateDirect(tex.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()
    quadTexCoords?.put(tex)?.position(0)
    val textures = IntArray(1)
    GLES20.glGenTextures(1, textures, 0)
    textureId = textures[0]
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
    GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
    val vertexShader = loadShader(GLES20.GL_VERTEX_SHADER, VERTEX_SHADER)
    val fragmentShader = loadShader(GLES20.GL_FRAGMENT_SHADER, FRAGMENT_SHADER)
    program = GLES20.glCreateProgram()
    GLES20.glAttachShader(program, vertexShader)
    GLES20.glAttachShader(program, fragmentShader)
    GLES20.glLinkProgram(program)
  }

  fun getTextureId(): Int = textureId

  fun draw(frame: Frame) {
    if (frame.timestamp == 0L) return
    frame.transformDisplayUvCoords(quadTexCoords, quadTexCoords)
    GLES20.glUseProgram(program)
    val posLoc = GLES20.glGetAttribLocation(program, "a_Position")
    val texLoc = GLES20.glGetAttribLocation(program, "a_TexCoord")
    GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
    GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId)
    val texUniform = GLES20.glGetUniformLocation(program, "sTexture")
    GLES20.glUniform1i(texUniform, 0)
    GLES20.glEnableVertexAttribArray(posLoc)
    GLES20.glVertexAttribPointer(posLoc, 2, GLES20.GL_FLOAT, false, 0, quadCoords)
    GLES20.glEnableVertexAttribArray(texLoc)
    GLES20.glVertexAttribPointer(texLoc, 2, GLES20.GL_FLOAT, false, 0, quadTexCoords)
    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4)
    GLES20.glDisableVertexAttribArray(posLoc)
    GLES20.glDisableVertexAttribArray(texLoc)
  }

  private fun loadShader(type: Int, code: String): Int {
    val shader = GLES20.glCreateShader(type)
    GLES20.glShaderSource(shader, code)
    GLES20.glCompileShader(shader)
    return shader
  }

  companion object {
    private const val VERTEX_SHADER = """
      attribute vec4 a_Position;
      attribute vec2 a_TexCoord;
      varying vec2 v_TexCoord;
      void main() {
        gl_Position = a_Position;
        v_TexCoord = a_TexCoord;
      }
    """
    private const val FRAGMENT_SHADER = """
      #extension GL_OES_EGL_image_external : require
      precision mediump float;
      varying vec2 v_TexCoord;
      uniform samplerExternalOES sTexture;
      void main() {
        gl_FragColor = texture2D(sTexture, v_TexCoord);
      }
    """
  }
}
