@rem CampusAR Windows JDK: use Microsoft OpenJDK 17 only (ignores broken JAVA_HOME).
set "CAMPUSAR_MS_JDK=C:\Program Files\Microsoft\jdk-17.0.16.8-hotspot"
if exist "%CAMPUSAR_MS_JDK%\bin\java.exe" (
  set "JAVA_HOME=%CAMPUSAR_MS_JDK%"
)
