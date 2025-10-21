from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app.models.user import User

# Configure logger
logger = logging.getLogger(__name__)

# Configuração
SECRET_KEY = "your-secret-key-here-change-in-production"  # TODO: Mover para variável de ambiente
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480  # 8 horas

security = HTTPBearer()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica se a senha está correta"""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password: str) -> str:
    """Gera hash da senha"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Cria token JWT"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_token(token: str) -> dict:
    """Decodifica token JWT"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning(f"🔒 Token expirado")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado"
        )
    except jwt.JWTClaimsError as e:
        logger.warning(f"🔒 Claims inválidos no token: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token com claims inválidos"
        )
    except JWTError as e:
        logger.warning(f"🔒 Erro ao decodificar token: {type(e).__name__}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado"
        )

def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """Autentica usuário"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Obtém usuário atual do token"""
    try:
        token = credentials.credentials
        payload = decode_token(token)
        username: str = payload.get("sub")
        
        if username is None:
            logger.warning(f"🔒 Token sem username (sub) no payload")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido - sem username"
            )
        
        user = db.query(User).filter(User.username == username).first()
        if user is None:
            logger.warning(f"🔒 Usuário '{username}' não encontrado no banco de dados")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Usuário não encontrado"
            )
        
        if not user.is_active:
            logger.warning(f"🔒 Tentativa de acesso com usuário inativo: {username}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Usuário inativo"
            )
        
        logger.debug(f"✓ Usuário autenticado: {username} (role: {user.role})")
        return user
        
    except HTTPException:
        # Re-raise HTTPException para não capturar novamente
        raise
    except Exception as e:
        logger.error(f"🔒 Erro inesperado na autenticação: {type(e).__name__}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Erro ao processar autenticação"
        )

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Requer que o usuário seja administrador"""
    if current_user.role != "admin":
        logger.warning(
            f"🔒 Acesso negado: usuário '{current_user.username}' "
            f"(role: {current_user.role}) tentou acessar recurso admin"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso negado. Requer permissão de administrador."
        )
    return current_user

