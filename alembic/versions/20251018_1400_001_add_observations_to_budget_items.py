"""Add observations field to budget_items

Revision ID: 001
Revises:
Create Date: 2025-10-18 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add observations column to budget_items table"""
    # Check if column already exists before adding
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('budget_items')]

    if 'observations' not in columns:
        op.add_column('budget_items', sa.Column('observations', sa.Text(), nullable=True))
        print("✓ Added 'observations' column to budget_items")
    else:
        print("ℹ Column 'observations' already exists in budget_items")


def downgrade() -> None:
    """Remove observations column from budget_items table"""
    op.drop_column('budget_items', 'observations')
