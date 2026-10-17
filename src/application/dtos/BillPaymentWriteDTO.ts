import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export default class BillPaymentWriteDTO {
  @IsNotEmpty({ message: 'Amount is required' })
  @IsNumber()
  @Min(0.01, { message: 'Amount must be greater than zero' })
  amount!: number;

  @IsNotEmpty({ message: 'Payment date is required' })
  @IsDateString()
  paymentDate!: string;

  @IsNotEmpty({ message: 'Payment method is required' })
  @IsString()
  paymentMethod!: string;

  @IsNotEmpty({ message: 'Bank/Cash account is required' })
  @IsString()
  bankAccountId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
