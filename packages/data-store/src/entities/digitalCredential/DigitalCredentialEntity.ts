import { BaseEntity, Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import {
  CredentialCorrelationType,
  CredentialDocumentFormat,
  CredentialRole,
  CredentialStateType,
  DigitalCredential,
  DocumentType,
  RegulationType,
} from '../../types'
import { typeormDate, typeOrmDateTime } from '@sphereon/ssi-sdk.agent-config'

@Entity('DigitalCredential')
export class DigitalCredentialEntity extends BaseEntity implements DigitalCredential {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column('text', { name: 'parent_id', nullable: true })
  parentId?: string

  @Column('simple-enum', { name: 'document_type', enum: DocumentType, nullable: false })
  documentType!: DocumentType

  @Column('simple-enum', { name: 'regulation_type', enum: RegulationType, nullable: false })
  regulationType!: RegulationType

  @Column('simple-enum', { name: 'document_format', enum: CredentialDocumentFormat, nullable: false })
  documentFormat!: CredentialDocumentFormat

  @Column('simple-enum', { name: 'credential_role', enum: CredentialRole, nullable: false })
  credentialRole!: CredentialRole

  @Column('text', { name: 'raw_document', nullable: false })
  rawDocument!: string

  @Column('text', { name: 'uniform_document', nullable: false })
  uniformDocument!: string

  @Column('text', { name: 'credential_id', nullable: true, unique: false })
  credentialId!: string

  @Column('text', { name: 'hash', nullable: false, unique: true })
  hash!: string

  @Column('text', { name: 'kms_key_ref', nullable: false })
  kmsKeyRef!: string

  @Column('text', { name: 'identifier_method', nullable: false })
  identifierMethod!: string

  @Column('simple-enum', { name: 'issuer_correlation_type', enum: CredentialCorrelationType, nullable: false })
  issuerCorrelationType!: CredentialCorrelationType

  @Column('simple-enum', { name: 'subject_correlation_type', enum: CredentialCorrelationType, nullable: true })
  subjectCorrelationType?: CredentialCorrelationType

  @Column('simple-enum', { name: 'rp_correlation_type', enum: CredentialCorrelationType, nullable: true })
  rpCorrelationType?: CredentialCorrelationType

  @Column('text', { name: 'issuer_correlation_id', nullable: false })
  issuerCorrelationId!: string

  @Column('text', { name: 'subject_correlation_id', nullable: true })
  subjectCorrelationId?: string

  @Column('text', { name: 'rp_correlation_id', nullable: true })
  rpCorrelationId?: string

  @Column('simple-enum', { name: 'verified_state', enum: CredentialStateType, nullable: true })
  verifiedState?: CredentialStateType

  @Column('text', { name: 'tenant_id', nullable: true })
  tenantId?: string

  @CreateDateColumn({ name: 'created_at', nullable: false, type: typeOrmDateTime() })
  createdAt!: Date

  @Column({ name: 'presented_at', nullable: true, type: typeormDate() })
  presentedAt?: Date

  @UpdateDateColumn({ name: 'last_updated_at', nullable: false, type: typeOrmDateTime() })
  lastUpdatedAt!: Date

  @Column({ name: 'valid_until', nullable: true, type: typeormDate() })
  validUntil?: Date

  @Column({ name: 'valid_from', nullable: true, type: typeormDate() })
  validFrom?: Date

  @Column({ name: 'verified_at', nullable: true, type: typeOrmDateTime() })
  verifiedAt?: Date

  @Column({ name: 'revoked_at', nullable: true, type: typeOrmDateTime() })
  revokedAt?: Date
}
