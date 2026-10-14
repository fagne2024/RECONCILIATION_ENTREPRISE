# ====== BUILD STAGE ======
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace
COPY pom.xml .
RUN mvn -B -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -B -DskipTests clean package

# ====== RUNTIME STAGE ======
FROM eclipse-temurin:17-jre
WORKDIR /app

ENV JAVA_OPTS="-Xms4g -Xmx8g \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/app/logs/ \
  -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=200 \
  -XX:+ParallelRefProcEnabled \
  -XX:+UnlockExperimentalVMOptions \
  -Xlog:gc*,gc+heap=debug:/app/logs/gc-%p-%t.log:time,uptime,level,tags:filecount=5,filesize=10m"

COPY --from=build /workspace/target/*.jar /app/app.jar

RUN mkdir -p /app/logs

EXPOSE 8080
ENTRYPOINT ["/bin/sh","-c","java $JAVA_OPTS -jar /app/app.jar"]

