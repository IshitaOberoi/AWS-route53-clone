"""Initial schema: users, sessions, hosted zones (+ VPCs, tags) and records.

Revision ID: 0001
Revises:
Create Date: 2026-10-08
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '0001'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('username', sa.String(length=64), nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=False),
    sa.Column('display_name', sa.String(length=128), nullable=False),
    sa.Column('account_id', sa.String(length=12), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('username', name=op.f('uq_users_username'))
    )
    op.create_table('hosted_zones',
    sa.Column('id', sa.String(length=32), nullable=False),
    sa.Column('owner_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=254), nullable=False),
    sa.Column('type', sa.String(length=16), nullable=False),
    sa.Column('description', sa.String(length=256), server_default='', nullable=False),
    sa.Column('caller_reference', sa.String(length=64), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("type IN ('PUBLIC', 'PRIVATE')", name=op.f('ck_hosted_zones_type')),
    sa.CheckConstraint('length(description) <= 256', name=op.f('ck_hosted_zones_description_length')),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], name=op.f('fk_hosted_zones_owner_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_hosted_zones')),
    sa.UniqueConstraint('caller_reference', name=op.f('uq_hosted_zones_caller_reference'))
    )
    with op.batch_alter_table('hosted_zones', schema=None) as batch_op:
        batch_op.create_index('ix_hosted_zones_owner_id_name', ['owner_id', 'name'], unique=False)

    op.create_table('sessions',
    sa.Column('id', sa.String(length=64), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('last_seen_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_sessions_user_id_users'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_sessions'))
    )
    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_sessions_user_id'), ['user_id'], unique=False)

    op.create_table('hosted_zone_tags',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('zone_id', sa.String(length=32), nullable=False),
    sa.Column('key', sa.String(length=128), nullable=False),
    sa.Column('value', sa.String(length=256), server_default='', nullable=False),
    sa.CheckConstraint('length(key) BETWEEN 1 AND 128', name=op.f('ck_hosted_zone_tags_key_length')),
    sa.CheckConstraint('length(value) <= 256', name=op.f('ck_hosted_zone_tags_value_length')),
    sa.ForeignKeyConstraint(['zone_id'], ['hosted_zones.id'], name=op.f('fk_hosted_zone_tags_zone_id_hosted_zones'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_hosted_zone_tags')),
    sa.UniqueConstraint('zone_id', 'key', name=op.f('uq_hosted_zone_tags_zone_id_key'))
    )
    op.create_table('hosted_zone_vpcs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('zone_id', sa.String(length=32), nullable=False),
    sa.Column('vpc_region', sa.String(length=32), nullable=False),
    sa.Column('vpc_id', sa.String(length=32), nullable=False),
    sa.ForeignKeyConstraint(['zone_id'], ['hosted_zones.id'], name=op.f('fk_hosted_zone_vpcs_zone_id_hosted_zones'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_hosted_zone_vpcs')),
    sa.UniqueConstraint('zone_id', 'vpc_region', 'vpc_id', name=op.f('uq_hosted_zone_vpcs_zone_id_vpc_region_vpc_id'))
    )
    op.create_table('records',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('zone_id', sa.String(length=32), nullable=False),
    sa.Column('name', sa.String(length=254), nullable=False),
    sa.Column('type', sa.String(length=8), nullable=False),
    sa.Column('ttl', sa.Integer(), nullable=True),
    sa.Column('values', sa.JSON(), nullable=False),
    sa.Column('routing_policy', sa.String(length=16), server_default='SIMPLE', nullable=False),
    sa.Column('set_identifier', sa.String(length=128), server_default='', nullable=False),
    sa.Column('weight', sa.Integer(), nullable=True),
    sa.Column('region', sa.String(length=32), nullable=True),
    sa.Column('failover', sa.String(length=16), nullable=True),
    sa.Column('geo_location', sa.String(length=16), nullable=True),
    sa.Column('health_check_id', sa.String(length=64), nullable=True),
    sa.Column('is_alias', sa.Boolean(), server_default=sa.text('0'), nullable=False),
    sa.Column('alias_target', sa.String(length=254), nullable=True),
    sa.Column('alias_target_type', sa.String(length=32), nullable=True),
    sa.Column('evaluate_target_health', sa.Boolean(), server_default=sa.text('0'), nullable=False),
    sa.Column('is_default', sa.Boolean(), server_default=sa.text('0'), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.CheckConstraint("failover IS NULL OR failover IN ('PRIMARY', 'SECONDARY')", name=op.f('ck_records_failover')),
    sa.CheckConstraint("routing_policy IN ('SIMPLE', 'WEIGHTED', 'LATENCY', 'FAILOVER', 'GEOLOCATION', 'MULTIVALUE')", name=op.f('ck_records_routing_policy')),
    sa.CheckConstraint("type IN ('A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS', 'PTR', 'SRV', 'CAA', 'SOA')", name=op.f('ck_records_type')),
    sa.CheckConstraint('is_alias = 0 OR alias_target IS NOT NULL', name=op.f('ck_records_alias_target_required')),
    sa.CheckConstraint('is_alias = 1 OR ttl IS NOT NULL', name=op.f('ck_records_ttl_required_unless_alias')),
    sa.CheckConstraint('ttl IS NULL OR (ttl BETWEEN 0 AND 2147483647)', name=op.f('ck_records_ttl_range')),
    sa.CheckConstraint('weight IS NULL OR (weight BETWEEN 0 AND 255)', name=op.f('ck_records_weight_range')),
    sa.ForeignKeyConstraint(['zone_id'], ['hosted_zones.id'], name=op.f('fk_records_zone_id_hosted_zones'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_records')),
    sa.UniqueConstraint('zone_id', 'name', 'type', 'set_identifier', name=op.f('uq_records_zone_id_name_type_set_identifier'))
    )
    with op.batch_alter_table('records', schema=None) as batch_op:
        batch_op.create_index('ix_records_zone_id_name', ['zone_id', 'name'], unique=False)
        batch_op.create_index('ix_records_zone_id_type', ['zone_id', 'type'], unique=False)



def downgrade() -> None:
    with op.batch_alter_table('records', schema=None) as batch_op:
        batch_op.drop_index('ix_records_zone_id_type')
        batch_op.drop_index('ix_records_zone_id_name')

    op.drop_table('records')
    op.drop_table('hosted_zone_vpcs')
    op.drop_table('hosted_zone_tags')
    with op.batch_alter_table('sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_sessions_user_id'))

    op.drop_table('sessions')
    with op.batch_alter_table('hosted_zones', schema=None) as batch_op:
        batch_op.drop_index('ix_hosted_zones_owner_id_name')

    op.drop_table('hosted_zones')
    op.drop_table('users')
