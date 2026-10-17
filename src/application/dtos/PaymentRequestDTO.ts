import { IsArray, IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateIf } from "class-validator";
import PaymentType from "../../domain/enums/PaymentType";
import PaymentMethod from "../../domain/enums/PaymentMethod";
import { Type } from "class-transformer";

const paymentTypes = Object.values(PaymentType);

class PaymentCustomerRequestDTO {
    @IsNotEmpty()
    @IsString()
    name!: string;

    @IsOptional()
    @IsString()
    address?: string;

    @IsOptional()
    @IsString()
    phone?: string;

    @IsOptional()
    @IsString()
    email?: string;
}

class PaymentRequestDTO {
    @ValidateIf((dto) => !dto.categoryId && !dto.billId, { message: 'Either feeId, categoryId, or billId must be provided' })
    @IsNotEmpty()
    @IsString()
    feeId?: string;

    @ValidateIf((dto) => !dto.feeId && !dto.billId && (dto.paymentType === PaymentType.INCOME || dto.paymentType === PaymentType.EXPENSE), { message: 'categoryId is required for income and expense payments' })
    @IsNotEmpty()
    @IsString()
    categoryId?: string;

    @ValidateIf((dto) => dto.paymentType === PaymentType.BILL, { message: 'billId is required for bill payments' })
    @IsNotEmpty()
    @IsString()
    billId?: string;
    
    @IsNotEmpty()
    @IsNumber()
    @IsPositive({ message: 'Amount must be a positive number' })
    amount!: number;

    @ValidateIf((dto) => !dto.feeId)
    @IsNotEmpty()
    @IsString()
    @IsIn(paymentTypes, { message: `Payment type must be one of the following: ${paymentTypes.join(', ')}` })
    paymentType?: string;

    @IsOptional()
    @IsString()
    @IsIn(Object.values(PaymentMethod), { message: `Payment method must be one of the following: ${Object.values(PaymentMethod).join(', ')}` })
    paymentMethod?: string;

    @IsNotEmpty()
    @IsDateString()
    paymentDate?: string;

    attachmentUrl?: string;

    @IsOptional()
    @IsString()
    externalReference?: string;

    @IsOptional()
    @IsString()
    comments?: string;

    @IsNotEmpty()
    @IsString()
    chartOfAccountId!: string;

    @IsOptional()
    @IsString()
    studentId?: string | null;

    @ValidateIf((dto) => dto.paymentType === PaymentType.INCOME && !dto.studentId)
    @IsOptional()
    @Type(() => PaymentCustomerRequestDTO)
    customer?: PaymentCustomerRequestDTO;

    @IsOptional()
    @IsArray()
    files?: any[];
};

export default PaymentRequestDTO;
