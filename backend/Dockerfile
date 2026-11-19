# Employee Welfare Portal API — container image (Azure Container Apps).
# Build context is the backend/ folder (so backend/.dockerignore applies):
#   docker build -t welfare-backend ./backend
#   az acr build --registry <acr> --image welfare-backend:v1 ./backend

# build
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY *.csproj ./backend/
RUN dotnet restore ./backend/backend.csproj
COPY . ./backend/
RUN dotnet publish ./backend/backend.csproj -c Release -o /app/publish --no-restore

# runtime
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish ./
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "backend.dll"]
