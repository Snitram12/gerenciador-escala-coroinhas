# Deploy no Google Cloud Run

## 1. Pré-requisitos
- Conta no Google Cloud
- Google Cloud SDK instalado
- Docker instalado
- Projeto no Google Cloud com faturamento habilitado

## 2. Configurar o projeto
```bash
gcloud config set project SEU_PROJECT_ID
gcloud auth login
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## 3. Construir e publicar a imagem
```bash
gcloud builds submit --tag gcr.io/SEU_PROJECT_ID/gerenciador-escala-coroinhas
```

## 4. Criar o serviço no Cloud Run
```bash
gcloud run deploy gerenciador-escala-coroinhas \
  --image gcr.io/SEU_PROJECT_ID/gerenciador-escala-coroinhas \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars ADMIN_USERNAME=Administrador,ADMIN_PASSWORD=Admin123
```

## 5. Acesso
A URL será exibida no final do comando.
