import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateDigitalCredential1708525189001 implements MigrationInterface {
  name = 'CreateDigitalCredential1708525189001'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "digital_credential_type" AS ENUM('VC', 'VP', 'C', 'P')`)
    await queryRunner.query(`CREATE TYPE "digital_credential_document_format" AS ENUM('JSON_LD', 'JWT', 'SD_JWT', 'MDOC')`)
    await queryRunner.query(`CREATE TYPE "digital_credential_correlation_type" AS ENUM('DID')`)
    await queryRunner.query(`CREATE TYPE "digital_credential_state_type" AS ENUM('REVOKED', 'VERIFIED', 'EXPIRED')`)

    await queryRunner.query(`
      CREATE TABLE "DigitalCredential" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "credential_type" "digital_credential_type" NOT NULL,
        "document_format" "digital_credential_document_format" NOT NULL,
        "raw" text NOT NULL,
        "uniform_document" text NOT NULL,
        "hash" text NOT NULL UNIQUE,
        "issuer_correlation_type" "digital_credential_correlation_type" NOT NULL,
        "subject_correlation_type" "digital_credential_correlation_type",
        "issuer_correlation_id" text NOT NULL,
        "subject_correlation_id" text,
        "verified_state" "digital_credential_state_type",
        "tenant_id" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "last_updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "issued_at" DATE,
        "expires_at" DATE,
        "last_verification_date" DATE,
        "revocation_date" DATE,
        PRIMARY KEY ("id")
      )
    `)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "DigitalCredential"`)
    await queryRunner.query(`DROP TYPE "digital_credential_state_type"`)
    await queryRunner.query(`DROP TYPE "digital_credential_correlation_type"`)
    await queryRunner.query(`DROP TYPE "digital_credential_document_format"`)
    await queryRunner.query(`DROP TYPE "digital_credential_type"`)
  }
}
