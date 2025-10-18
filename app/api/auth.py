from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
from pydantic import BaseModel
import re

from app.database import get_db
from app.schemas.user import UserLogin, Token, UserResponse
from app.services.auth_service import (
    authenticate_user,
    create_access_token,
    get_current_user,
    verify_password,
    get_password_hash,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from app.models.user import User

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

def validate_password_strength(password: str) -> str:
    """
    Valida a força da senha.
    Retorna mensagem de erro ou None se válida.
    """
    if len(password) < 8:
        return "A senha deve ter no mínimo 8 caracteres"
    
    if not re.search(r'[a-zA-Z]', password):
        return "A senha deve conter pelo menos uma letra"
    
    if not re.search(r'[0-9]', password):
        return "A senha deve conter pelo menos um número"
    
    if not re.search(r'[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]', password):
        return "A senha deve conter pelo menos um caractere especial"
    
    return None

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login", response_model=Token)
def login(user_login: UserLogin, db: Session = Depends(get_db)):
    """
    Autentica usuário e retorna token JWT
    """
    user = authenticate_user(db, user_login.username, user_login.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha incorretos"
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """
    Retorna informações do usuário autenticado
    """
    return current_user

@router.post("/logout")
def logout():
    """
    Logout do usuário (no lado do cliente, apenas remove o token)
    """
    return {"message": "Logout realizado com sucesso"}

@router.put("/change-password")
def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Permite ao usuário trocar sua própria senha
    """
    # Verificar se a senha atual está correta
    if not verify_password(password_data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Senha atual incorreta"
        )
    
    # Validar força da nova senha
    password_error = validate_password_strength(password_data.new_password)
    if password_error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=password_error
        )
    
    # Atualizar senha
    current_user.password_hash = get_password_hash(password_data.new_password[:72])
    db.commit()
    
    return {"message": "Senha alterada com sucesso"}

